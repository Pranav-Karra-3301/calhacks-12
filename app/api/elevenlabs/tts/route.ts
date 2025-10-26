import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const ELEVEN_MODEL_ID = 'eleven_v3'

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLAB_API_KEY || process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing ELEVENLAB_API_KEY' }, { status: 500 })

  try {
    const { voiceId, text } = await request.json()
    if (!voiceId || !text) return NextResponse.json({ error: 'voiceId and text are required' }, { status: 400 })

    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({ model_id: ELEVEN_MODEL_ID, text }),
    })

    if (!resp.ok) {
      const body = await resp.text()
      return NextResponse.json({ error: 'TTS failed', upstream: { status: resp.status, body } }, { status: 502 })
    }

    const audio = Buffer.from(await resp.arrayBuffer())
    return new NextResponse(audio, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'x-eleven-model': ELEVEN_MODEL_ID,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}
