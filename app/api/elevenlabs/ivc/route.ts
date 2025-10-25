import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ELEVENLAB_API_KEY || process.env.ELEVENLABS_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Missing ELEVENLAB_API_KEY' }, { status: 500 })

    const form = await request.formData()
    const name = (form.get('name') as string) || 'My Voice Clone'
    const file = form.get('file') as Blob | null
    if (!file) return NextResponse.json({ error: 'Missing audio file' }, { status: 400 })

    // Prepare payload for ElevenLabs IVC
    const upstream = new FormData()
    upstream.set('name', name)
    // Historically, the API expects `files` (or `files[]`). Use `files`.
    upstream.append('files', file, 'sample.webm')

    const headers: HeadersInit = { 'xi-api-key': apiKey }

    // Try new IVC endpoint first; fall back to legacy `/voices/add` if needed
    const endpoints = [
      'https://api.elevenlabs.io/v1/voices/ivc/create',
      'https://api.elevenlabs.io/v1/voices/add',
    ]

    let lastErr: any = null
    for (const url of endpoints) {
      try {
        const resp = await fetch(url, { method: 'POST', headers, body: upstream })
        const text = await resp.text()
        if (!resp.ok) {
          lastErr = { status: resp.status, body: text }
          continue
        }
        // Response is JSON with voice info; normalize key to `voiceId`
        let data: any
        try { data = JSON.parse(text) } catch { data = text }
        const voiceId = data?.voice_id || data?.voiceId || data?.voice?.voice_id || null
        if (!voiceId) return NextResponse.json({ error: 'Missing voice id in response', raw: data }, { status: 502 })
        return NextResponse.json({ voiceId, raw: data })
      } catch (e) {
        lastErr = e
      }
    }

    return NextResponse.json({ error: 'IVC request failed', details: lastErr }, { status: 502 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}

