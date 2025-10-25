import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions'

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get('roomId')
    
    if (!roomId) {
      return NextResponse.json({ error: 'Missing roomId' }, { status: 400 })
    }

    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Authenticate user
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    )

    const { data: { user }, error: authError } = await anonClient.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get audio blob from request body
    const contentType = request.headers.get('content-type') || 'audio/mpeg'
    const audioBlob = await request.blob()
    
    if (!audioBlob || audioBlob.size === 0) {
      return NextResponse.json({ error: 'No audio data' }, { status: 400 })
    }

    // Determine file extension from Content-Type
    const ext = contentType.includes('mpeg') ? 'mp3'
      : contentType.includes('wav') ? 'wav'
      : contentType.includes('mp4') ? 'm4a'
      : contentType.includes('ogg') ? 'ogg'
      : contentType.includes('webm') ? 'webm'
      : 'mp3'

    // Create form data for OpenAI Whisper API
    const formData = new FormData()
    formData.append('file', audioBlob, `audio.${ext}`)
    formData.append('model', 'whisper-1')
    formData.append('response_format', 'json')
    formData.append('language', 'en')

    // Call OpenAI Whisper API
    const openaiResponse = await fetch(OPENAI_WHISPER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    })

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error('OpenAI Whisper API error:', errorText)
      return NextResponse.json({ error: 'Transcription failed' }, { status: 502 })
    }

    const transcriptionData = await openaiResponse.json()
    const text = transcriptionData.text?.trim()

    if (!text || text.length === 0) {
      // Empty transcription, ignore
      return NextResponse.json({ text: '' })
    }

    // Use service role client to insert transcript
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error: insertError } = await serviceClient
      .from('transcripts')
      .insert({
        room_id: roomId,
        uid: user.id,
        text: text,
      })

    if (insertError) {
      console.error('Failed to insert transcript:', insertError)
      return NextResponse.json({ error: 'Failed to save transcript' }, { status: 500 })
    }

    return NextResponse.json({ text })
  } catch (error: any) {
    console.error('Transcribe chunk API error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to transcribe' }, { status: 500 })
  }
}

