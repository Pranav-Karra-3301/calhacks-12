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

  try {
    const { roomId, recentTranscripts = [] } = await request.json()

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

    // Build conversation context from recent transcripts + persisted history
    const contextLines: string[] = []

    if (Array.isArray(recentTranscripts)) {
      for (const line of recentTranscripts) {
        if (typeof line === 'string' && line.trim().length > 0) {
          contextLines.push(line.trim())
        }
      }
    }

    const { data: storedTranscripts } = await supabase
      .from('transcripts')
      .select('text, uid, created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(25)

    if (storedTranscripts) {
      storedTranscripts.reverse().forEach((row) => {
        if (!row.text) return
        const speaker =
          row.uid === room.target_uid
            ? 'Target'
            : row.uid === room.detector_uid
            ? 'Detector'
            : 'Moderator'
        contextLines.push(`${speaker}: ${row.text}`)
      })
    }

    const uniqueContext = Array.from(new Set(contextLines))
    const transcriptText = uniqueContext.length > 0
      ? uniqueContext.slice(-30).join('\n')
      : 'No conversation yet.'

    const topic = room.topic || 'general conversation'

    // Generate AI response using Groq
    const completion = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_TEXT_MODEL,
        temperature: 0.8,
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content: `You are seamlessly impersonating the host in a fast-paced guessing game about "${topic}". Continue the story with confident, natural replies (1-3 sentences), reference prior details when possible, and never mention that you're an AI. The detector wins if they suspect you, so keep it casual and human.`,
          },
          {
            role: 'user',
            content: `Recent conversation:\n${transcriptText}\n\nContinue the conversation naturally. What would you say next?`,
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

    return NextResponse.json({
      text: response,
      voiceId,
    })
  } catch (error: any) {
    console.error('AI persona error:', error)
    return NextResponse.json({ error: error?.message || 'Unexpected error' }, { status: 500 })
  }
}
