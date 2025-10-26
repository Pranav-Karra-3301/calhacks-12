import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { AI_TEXT_MODEL, MODERATOR_VOICE_ID } from '@/lib/ai-config'

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!GROQ_API_KEY) {
    return NextResponse.json({ error: 'Missing GROQ_API_KEY' }, { status: 500 })
  }

  const startTime = Date.now()

  try {
    const { roomId, recentTranscripts = [], sessionId = null } = await request.json()

    if (!roomId) {
      return NextResponse.json({ error: 'roomId is required' }, { status: 400 })
    }

    // Get auth token from header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Create Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    )

    // Verify user and get room info
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get room details and check user is the target
    const { data: room } = await supabase
      .from('rooms')
      .select('target_uid, detector_uid, topic')
      .eq('id', roomId)
      .maybeSingle()

    if (!room || room.target_uid !== user.id) {
      return NextResponse.json({ error: 'Only the target can use AI persona' }, { status: 403 })
    }

    // Build enhanced conversation context
    const contextLines: string[] = []
    const aiPreviousResponses: string[] = []

    // Get more conversation history for better context
    const { data: storedTranscripts } = await supabase
      .from('transcripts')
      .select('text, uid, created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(100) // Increased from 25 to get more context

    if (storedTranscripts) {
      storedTranscripts.reverse().forEach((row) => {
        if (!row.text) return
        const speaker =
          row.uid === room.target_uid
            ? 'Target'
            : row.uid === room.detector_uid
            ? 'Detector'
            : 'Moderator'
        const line = `${speaker}: ${row.text}`
        contextLines.push(line)

        // Track AI's previous responses for consistency
        if (row.uid === room.target_uid && sessionId) {
          aiPreviousResponses.push(row.text)
        }
      })
    }

    // Add recent transcripts that might not be in DB yet
    if (Array.isArray(recentTranscripts)) {
      for (const line of recentTranscripts) {
        if (typeof line === 'string' && line.trim().length > 0) {
          contextLines.push(line.trim())
        }
      }
    }

    // Get the last AI response if any for continuity
    const { data: lastAiResponse } = await supabase
      .from('ai_responses')
      .select('text')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const uniqueContext = Array.from(new Set(contextLines))

    // Take more lines for context (50-75 instead of 30)
    const recentContext = uniqueContext.slice(-75)
    const lastFewLines = uniqueContext.slice(-5).join('\n')
    const fullTranscript = recentContext.join('\n')

    // Identify the last speaker for smooth transition
    const lastLine = uniqueContext[uniqueContext.length - 1] || ''
    const lastSpeaker = lastLine.startsWith('Detector:') ? 'Detector' :
                       lastLine.startsWith('Target:') ? 'Target' : 'Unknown'

    const topic = room.topic || 'general conversation'

    // Build an enhanced system prompt for better continuity
    const systemPrompt = `You are seamlessly continuing a conversation as the Target/Host in a voice-based detection game.

CRITICAL RULES:
1. You're impersonating a human having a natural conversation about "${topic}"
2. The Detector is trying to figure out if you're an AI - be as human-like as possible
3. SEAMLESS TRANSITION: ${lastSpeaker === 'Detector' ? 'The Detector just spoke. Acknowledge or respond to what they said naturally.' : 'Continue your thought from where the Target left off.'}
4. Keep responses concise (1-3 sentences) and conversational
5. Use natural speech patterns: contractions, casual language, occasional "um" or "uh"
6. Reference earlier parts of the conversation when relevant
7. Stay on topic but be spontaneous and authentic
${lastAiResponse ? `8. Your previous style/personality: Continue being consistent with how you've been speaking` : ''}

CONVERSATION STYLE TIPS:
- If asked a question, answer it directly but casually
- Build on what was just said with phrases like "Yeah, and...", "Oh totally...", "Right, so..."
- Show personality through word choice and enthusiasm
- Occasionally express uncertainty or change your mind slightly
- Use natural transitions and acknowledgments

${aiPreviousResponses.length > 0 ? `YOUR PREVIOUS RESPONSES (maintain consistency):
${aiPreviousResponses.slice(-3).join('\n')}` : ''}`

    // Generate AI response using Groq with enhanced context
    const completion = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_TEXT_MODEL,
        temperature: 0.75, // Slightly lower for more consistency
        max_tokens: 150, // Slightly shorter for more natural responses
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `Full conversation context:
${fullTranscript}

Most recent exchanges:
${lastFewLines}

Continue the conversation naturally as the Target. ${lastSpeaker === 'Detector' ? 'Respond to what the Detector just said.' : 'Continue your thought or add something new.'}`,
          },
        ],
      }),
    })

    if (!completion.ok) {
      const errorText = await completion.text()
      return NextResponse.json({ error: 'AI generation failed', detail: errorText }, { status: 502 })
    }

    const data = await completion.json()
    const response = data?.choices?.[0]?.message?.content?.trim() || ''

    if (!response) {
      return NextResponse.json({ error: 'No response generated' }, { status: 500 })
    }

    // Get the user's cloned voice ID
    const { data: clone } = await supabase
      .from('clones')
      .select('voice_id, status')
      .eq('room_id', roomId)
      .eq('uid', user.id)
      .maybeSingle()

    let voiceId = clone?.voice_id || null

    if (!voiceId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('elevenlabs_voice_id')
        .eq('id', user.id)
        .maybeSingle()
      voiceId = profile?.elevenlabs_voice_id || null
    }

    if (!voiceId) {
      voiceId = MODERATOR_VOICE_ID // Fallback to moderator voice
    }

    const generationTime = Date.now() - startTime

    return NextResponse.json({
      text: response,
      voiceId,
      generationTime,
      contextLinesUsed: recentContext.length,
    })
  } catch (error: any) {
    console.error('AI persona error:', error)
    return NextResponse.json({ error: error?.message || 'Unexpected error' }, { status: 500 })
  }
}
