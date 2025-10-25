import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const voiceId = searchParams.get('voiceId')
  if (!voiceId) return NextResponse.json({ error: 'Missing voiceId' }, { status: 400 })
  const apiKey = process.env.ELEVENLAB_API_KEY || process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Missing ELEVENLAB_API_KEY' }, { status: 500 })

  try {
    const resp = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      headers: { 'xi-api-key': apiKey },
      cache: 'no-store',
    })
    const text = await resp.text()
    if (!resp.ok) return NextResponse.json({ error: 'Not found', status: resp.status, body: text }, { status: resp.status })
    let data: any
    try { data = JSON.parse(text) } catch { data = text }
    return NextResponse.json({
      id: data?.voice_id || data?.voiceId || voiceId,
      name: data?.name || 'Voice',
      category: data?.category || data?.voice_category || null,
      labels: data?.labels || null,
      raw: data,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}

