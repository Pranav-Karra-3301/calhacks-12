import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Cache voices for 1 hour to avoid excessive API calls
let voicesCache: any = null
let cacheTime = 0
const CACHE_DURATION = 60 * 60 * 1000 // 1 hour

export async function GET() {
  try {
    const apiKey = process.env.ELEVENLAB_API_KEY || process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing ELEVENLAB_API_KEY' }, { status: 500 })
    }

    // Return cached voices if still valid
    if (voicesCache && Date.now() - cacheTime < CACHE_DURATION) {
      return NextResponse.json(voicesCache)
    }

    // Fetch voices from ElevenLabs API
    const response = await fetch('https://api.elevenlabs.io/v2/voices', {
      headers: {
        'xi-api-key': apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`)
    }

    const data = await response.json()

    // Filter for high-quality voices that work well with different models
    const filteredVoices = data.voices.filter((voice: any) => {
      // Include premade, professional, and high-quality community voices
      const goodCategory = ['premade', 'professional', 'high_quality'].includes(voice.category)
      // Exclude voices that might not work well
      const notLegacy = !voice.is_legacy
      // Has preview URL for testing
      const hasPreview = !!voice.preview_url

      return goodCategory && notLegacy && hasPreview
    })

    // Sort by variety - mix different categories and characteristics
    const categorizedVoices = {
      premade: filteredVoices.filter((v: any) => v.category === 'premade'),
      professional: filteredVoices.filter((v: any) => v.category === 'professional'),
      highQuality: filteredVoices.filter((v: any) => v.category === 'high_quality'),
    }

    // Create a diverse pool of voices
    const voicePool = [
      ...categorizedVoices.premade.slice(0, 15),
      ...categorizedVoices.professional.slice(0, 10),
      ...categorizedVoices.highQuality.slice(0, 10),
    ]

    // Shuffle the pool for variety
    const shuffled = voicePool.sort(() => Math.random() - 0.5)

    const result = {
      voices: shuffled,
      total: shuffled.length,
      timestamp: Date.now(),
    }

    // Update cache
    voicesCache = result
    cacheTime = Date.now()

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('List voices error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch voices' },
      { status: 500 }
    )
  }
}