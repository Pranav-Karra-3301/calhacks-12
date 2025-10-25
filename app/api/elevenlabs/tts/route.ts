import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLAB_API_KEY || process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing ELEVENLAB_API_KEY' }, { status: 500 })

  try {
    const { voiceId, text, modelId } = await request.json()
    if (!voiceId || !text) return NextResponse.json({ error: 'voiceId and text are required' }, { status: 400 })

    // Preferred order: v3 first, then fast/affordable fallbacks.
    const models = modelId ? [modelId] : ['eleven_v3', 'eleven_flash_v2_5', 'eleven_turbo_v2_5', 'eleven_multilingual_v2']

    let lastError: { status?: number; body?: string } | null = null
    for (const model of models) {
      const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({ model_id: model, text }),
      })

      if (resp.ok) {
        const audio = Buffer.from(await resp.arrayBuffer())
        return new NextResponse(audio, {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'x-eleven-model': model },
        })
      }

      lastError = { status: resp.status, body: await resp.text() }
      // Try next model if not explicitly pinned by user
      if (modelId) break
    }

    return NextResponse.json({ error: 'TTS failed', upstream: lastError }, { status: 502 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}
