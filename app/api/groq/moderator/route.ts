import { NextResponse } from 'next/server'

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'gpt-oss-20b'

export async function POST(request: Request) {
  if (!GROQ_API_KEY) return NextResponse.json({ error: 'Missing GROQ_API_KEY' }, { status: 500 })
  try {
    const body = await request.json()
    const question: string = (body?.question || '').toString().trim()
    const transcript: string[] = Array.isArray(body?.transcript) ? body.transcript : []
    if (!question) return NextResponse.json({ error: 'Question required' }, { status: 400 })

    const history = transcript.slice(-6).join('\n') || 'No previous transcript shared.'
    const completion = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: 'You are the calm, encouraging moderator of The Mimic Game. Answer questions clearly and keep players hyped. Speak in 2-3 sentences max.',
          },
          {
            role: 'user',
            content: `Conversation snippet:\n${history}\n---\nPlayer asks: ${question}\nRespond as the moderator.`,
          },
        ],
      }),
    })

    if (!completion.ok) {
      const text = await completion.text()
      return NextResponse.json({ error: 'Groq moderator failed', detail: text }, { status: 502 })
    }
    const data = await completion.json()
    const answer = (data?.choices?.[0]?.message?.content ?? 'Let the show go on!').trim()
    return NextResponse.json({ answer })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unexpected moderator error' }, { status: 500 })
  }
}

