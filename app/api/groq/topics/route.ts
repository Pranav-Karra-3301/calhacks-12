import { NextResponse } from 'next/server'

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

export async function POST(request: Request) {
  if (!GROQ_API_KEY) return NextResponse.json({ error: 'Missing GROQ_API_KEY' }, { status: 500 })
  try {
    const { transcript = [] } = await request.json().catch(() => ({ transcript: [] })) as { transcript?: string[] }
    const lines = Array.isArray(transcript) ? transcript : []
    const summary = lines.slice(-6).join('\n') || 'No prior conversation. Suggest engaging openers.'

    const completion = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.6,
        messages: [
          {
            role: 'system',
            content: 'You suggest concise, creative conversation sparks for a high-energy social deduction game. Respond as JSON: {"ideas": ["..."]}',
          },
          {
            role: 'user',
            content: `Recent transcript snippet (may be empty):\n${summary}\n---\nReturn 3-4 playful prompts that keep the dialogue flowing.`,
          },
        ],
      }),
    })

    if (!completion.ok) {
      const text = await completion.text()
      return NextResponse.json({ error: 'Groq topics failed', detail: text }, { status: 502 })
    }
    const data = await completion.json()
    const content: string = data?.choices?.[0]?.message?.content ?? ''
    let suggestions: string[] = []
    try {
      const parsed = JSON.parse(content)
      if (parsed && Array.isArray(parsed.ideas)) suggestions = parsed.ideas
    } catch (_) {
      suggestions = content.split('\n').map((line: string) => line.replace(/^[-•\d\.\s]+/, '').trim()).filter(Boolean)
    }
    if (!suggestions.length) {
      suggestions = ['Share an embarrassing audition story.', 'If your voice could narrate any movie genre, what would it be?', 'Debate the superior midnight snack.']
    }
    return NextResponse.json({ suggestions })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unexpected topics error' }, { status: 500 })
  }
}

