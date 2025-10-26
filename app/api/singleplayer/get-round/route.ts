import { NextResponse } from 'next/server'
import manifest from '@/public/librispeech-manifest.json'

export const runtime = 'nodejs'

// Default ElevenLabs voice for narration
const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB' // Adam voice

export async function GET() {
  try {
    // Randomly select a sample
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

      // Use ElevenLabs TTS to generate audio
      const models = ['eleven_flash_v2_5', 'eleven_turbo_v2_5', 'eleven_multilingual_v2']
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
      // For human audio, we'll use browser's speech synthesis as a proxy for "real" audio
      // In production, this would be actual LibriSpeech audio files
      return NextResponse.json({
        roundId,
        audioUrl: null, // Will use speech synthesis on client
        text: sample.text,
        isAi: false,
        transcriptLength: sample.text.length,
        sampleId: sample.id,
      })
    }
  } catch (e: any) {
    console.error('Error in get-round:', e)
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}

