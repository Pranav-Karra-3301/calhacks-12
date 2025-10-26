import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import manifest from '@/public/librispeech-manifest.json'

export const runtime = 'nodejs'

// Default ElevenLabs voice for narration
const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB' // Adam voice

export async function GET() {
  try {
    // Randomly select a sample text
    const samples = manifest.samples
    const sample = samples[Math.floor(Math.random() * samples.length)]
    
    // 50% chance to use AI-generated audio
    const isAi = Math.random() < 0.5
    
    const roundId = `round_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    if (isAi) {
      // Generate AI audio using ElevenLabs
      const apiKey = process.env.ELEVENLAB_API_KEY || process.env.ELEVENLABS_API_KEY
      if (!apiKey) {
        return NextResponse.json({ error: 'Missing ELEVENLAB_API_KEY' }, { status: 500 })
      }

      // Use ElevenLabs TTS to generate audio with v3 model
      const models = ['eleven_v3', 'eleven_flash_v2_5', 'eleven_turbo_v2_5']
      let audioBuffer: Buffer | null = null
      
      for (const model of models) {
        try {
          const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE_ID}`, {
            method: 'POST',
            headers: {
              'xi-api-key': apiKey,
              'Content-Type': 'application/json',
              'Accept': 'audio/mpeg',
            },
            body: JSON.stringify({ model_id: model, text: sample.text }),
          })

          if (resp.ok) {
            audioBuffer = Buffer.from(await resp.arrayBuffer())
            break
          }
        } catch (e) {
          // Try next model
          continue
        }
      }

      if (!audioBuffer) {
        return NextResponse.json({ error: 'Failed to generate AI audio' }, { status: 502 })
      }

      // Return the audio as base64 data URL
      const base64Audio = audioBuffer.toString('base64')
      const audioDataUrl = `data:audio/mpeg;base64,${base64Audio}`

      return NextResponse.json({
        roundId,
        audioUrl: audioDataUrl,
        isAi: true, // Hidden from client, but stored for verification
        transcriptLength: sample.text.length,
        sampleId: sample.id,
      })
    } else {
      // For human audio, fetch from Supabase Storage "human-audio" bucket
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // List all files in the human-audio bucket
      const { data: files, error: listError } = await supabase.storage
        .from('human-audio')
        .list()

      if (listError || !files || files.length === 0) {
        console.error('Error listing human audio files:', listError)
        return NextResponse.json({ error: 'No human audio files available' }, { status: 500 })
      }

      // Filter only .flac files
      const flacFiles = files.filter(f => f.name.endsWith('.flac'))
      if (flacFiles.length === 0) {
        return NextResponse.json({ error: 'No FLAC files found' }, { status: 500 })
      }

      // Pick a random FLAC file
      const randomFile = flacFiles[Math.floor(Math.random() * flacFiles.length)]

      // Get public URL for the file
      const { data: { publicUrl } } = supabase.storage
        .from('human-audio')
        .getPublicUrl(randomFile.name)

      return NextResponse.json({
        roundId,
        audioUrl: publicUrl,
        isAi: false,
        transcriptLength: sample.text.length,
        sampleId: randomFile.name, // Use the actual filename
      })
    }
  } catch (e: any) {
    console.error('Error in get-round:', e)
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}

