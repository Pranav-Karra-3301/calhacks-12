import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import manifest from '@/public/librispeech-manifest.json'

export const runtime = 'nodejs'

type ManifestSample = {
  id: string
  text: string
  duration?: number
}

type RoundSource = 'ai' | 'human'

type PreparedRound = {
  roundId: string
  audioUrl: string
  isAi: boolean
  transcriptLength: number
  sampleId: string
  text: string
}

const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB'
const HUMAN_BUCKET = 'human-audio'
const MIN_PREFETCH = 3

// Available TTS models for variety
const TTS_MODELS = [
  'eleven_v3_alpha',        // Most expressive
  'eleven_turbo_v2_5',      // Good balance
  'eleven_multilingual_v2',  // Consistent quality
  'eleven_flash_v2_5',      // Fast generation
]

// Voice pool management
let voicePool: any[] = []
let voicePoolIndex = 0
let lastVoiceFetch = 0
const VOICE_CACHE_DURATION = 60 * 60 * 1000 // 1 hour

const manifestSamples = (manifest.samples ?? []) as ManifestSample[]

const supabaseAdmin =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null

const roundQueue: PreparedRound[] = []
let nextSource: RoundSource = 'ai'
let prefetchPromise: Promise<void> | null = null
let cachedHumanFiles: string[] | null = null

function randomSample(): ManifestSample {
  if (!manifestSamples.length) {
    throw new Error('No manifest samples available')
  }
  return manifestSamples[Math.floor(Math.random() * manifestSamples.length)]
}

function newRoundId() {
  return `round_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

async function ensureVoicePool() {
  // Refresh voice pool if it's empty or stale
  if (
    voicePool.length === 0 ||
    Date.now() - lastVoiceFetch > VOICE_CACHE_DURATION
  ) {
    try {
      // Fetch available voices from our API
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/elevenlabs/list-voices`
      )

      if (response.ok) {
        const data = await response.json()
        if (data.voices && data.voices.length > 0) {
          voicePool = data.voices
          voicePoolIndex = 0
          lastVoiceFetch = Date.now()
          console.log(`Loaded ${voicePool.length} voices into pool`)
        }
      }
    } catch (error) {
      console.error('Failed to fetch voice pool:', error)
      // Fall back to a few default voices if fetch fails
      voicePool = [
        { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
        { voice_id: 'Zlb1dXrM653N07WRdFW3', name: 'Domi' },
        { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
        { voice_id: 'AZnzlk1XvdvUeBnXmlld', name: 'Antoni' },
        { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella' },
      ]
    }
  }
}

function getNextVoice() {
  if (voicePool.length === 0) {
    return DEFAULT_VOICE_ID
  }

  const voice = voicePool[voicePoolIndex]
  voicePoolIndex = (voicePoolIndex + 1) % voicePool.length

  return voice.voice_id || DEFAULT_VOICE_ID
}

function getNextModel() {
  const models = TTS_MODELS
  const model = models[Math.floor(Math.random() * models.length)]
  return model
}

async function synthesizeWithElevenLabs(text: string) {
  const apiKey = process.env.ELEVENLAB_API_KEY || process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    throw new Error('Missing ELEVENLAB_API_KEY')
  }

  // Ensure voice pool is loaded
  await ensureVoicePool()

  // Get next voice and model for variety
  const voiceId = getNextVoice()
  const modelId = getNextModel()

  console.log(`Synthesizing with voice: ${voiceId}, model: ${modelId}`)

  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      model_id: modelId,
      text,
      // Add some variety in voice settings for more natural variation
      voice_settings: {
        stability: [0.0, 0.5, 1.0][Math.floor(Math.random() * 3)], // Must be 0.0, 0.5, or 1.0
        similarity_boost: 0.5 + Math.random() * 0.3, // 0.5 to 0.8
        style: modelId === 'eleven_v3_alpha' ? Math.random() * 0.5 : 0, // Style only for v3
        use_speaker_boost: Math.random() > 0.5,
      }
    }),
  })

  if (!resp.ok) {
    const body = await resp.text()
    console.error(`ElevenLabs synthesis failed with voice ${voiceId}: ${resp.status}`)
    // Fallback to default voice if current one fails
    if (voiceId !== DEFAULT_VOICE_ID) {
      console.log('Retrying with default voice...')
      const fallbackResp = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE_ID}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          body: JSON.stringify({ model_id: 'eleven_turbo_v2_5', text }),
        }
      )

      if (!fallbackResp.ok) {
        throw new Error(`ElevenLabs synthesis failed: ${resp.status}`)
      }

      const audioBuffer = Buffer.from(await fallbackResp.arrayBuffer())
      return `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`
    }
    throw new Error(`ElevenLabs synthesis failed: ${resp.status} ${body}`)
  }

  const audioBuffer = Buffer.from(await resp.arrayBuffer())
  return `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`
}

async function ensureHumanFileCache() {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client is not configured')
  }
  if (cachedHumanFiles && cachedHumanFiles.length > 0) return

  const { data: files, error } = await supabaseAdmin.storage.from(HUMAN_BUCKET).list('', {
    limit: 1000,
  })

  if (error) {
    throw error
  }

  const allowedExtensions = ['.flac', '.wav', '.mp3', '.m4a']
  cachedHumanFiles =
    files
      ?.filter((file) => allowedExtensions.some((ext) => file.name.toLowerCase().endsWith(ext)))
      .map((file) => file.name) || null

  if (!cachedHumanFiles || cachedHumanFiles.length === 0) {
    throw new Error('No human audio files available in human-audio bucket')
  }
}

async function buildHumanRound(sample: ManifestSample): Promise<PreparedRound> {
  await ensureHumanFileCache()
  if (!supabaseAdmin || !cachedHumanFiles?.length) {
    throw new Error('Human audio cache is empty')
  }

  const filename = cachedHumanFiles[Math.floor(Math.random() * cachedHumanFiles.length)]
  const { data } = supabaseAdmin.storage.from(HUMAN_BUCKET).getPublicUrl(filename)

  return {
    roundId: newRoundId(),
    audioUrl: data.publicUrl,
    isAi: false,
    transcriptLength: sample.text.length,
    sampleId: filename,
    text: sample.text,
  }
}

async function buildAiRound(sample: ManifestSample): Promise<PreparedRound> {
  const audioUrl = await synthesizeWithElevenLabs(sample.text)
  return {
    roundId: newRoundId(),
    audioUrl,
    isAi: true,
    transcriptLength: sample.text.length,
    sampleId: sample.id,
    text: sample.text,
  }
}

async function ensurePrefetch(targetLength = MIN_PREFETCH) {
  if (prefetchPromise) {
    return prefetchPromise
  }

  prefetchPromise = (async () => {
    while (roundQueue.length < targetLength) {
      const sample = randomSample()
      const source = nextSource
      nextSource = source === 'ai' ? 'human' : 'ai'

      try {
        const round =
          source === 'ai' ? await buildAiRound(sample) : await buildHumanRound(sample)
        roundQueue.push(round)
      } catch (error) {
        console.error('Failed to prefetch round', error)
        if (source === 'human') {
          try {
            // Fall back to AI so players are never blocked, even if mix suffers temporarily.
            const fallbackRound = await buildAiRound(sample)
            roundQueue.push(fallbackRound)
            continue
          } catch (fallbackError) {
            console.error('Fallback AI prefetch also failed', fallbackError)
          }
        }
        break
      }
    }
  })()
    .catch((error) => {
      console.error('Prefetch worker failed', error)
    })
    .finally(() => {
      prefetchPromise = null
    })

  return prefetchPromise
}

export async function GET() {
  try {
    if (roundQueue.length === 0) {
      await ensurePrefetch()
    }

    const nextRound = roundQueue.shift()
    if (!nextRound) {
      throw new Error('Unable to prepare a round')
    }

    // Warm additional rounds in the background.
    ensurePrefetch().catch(() => {})

    return NextResponse.json(nextRound)
  } catch (e: any) {
    console.error('Error in get-round:', e)
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}
