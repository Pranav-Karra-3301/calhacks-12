"use client"
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { VoiceRecorder } from '@/components/elevenlabs/VoiceRecorder'
import { generateRandomSeed, generateAvatarUrl, type AvatarOptions } from '@/lib/avatar'
import { AvatarCustomizationModal } from '@/components/AvatarCustomizationModal'

type Profile = {
  id: string
  display_name: string | null
  elevenlabs_voice_id: string | null
  avatar_seed: string | null
  avatar_options: AvatarOptions | null
}

type MetricStats = {
  roomsHosted: number
  gamesPlayed: number
  aiMoments: number
  detectorAccuracy: number | null
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [voiceInfo, setVoiceInfo] = useState<{ id: string; name: string; category?: string | null } | null>(null)
  const [ivcBusy, setIvcBusy] = useState(false)
  const [ttsBusy, setTtsBusy] = useState(false)
  const [ttsText, setTtsText] = useState("This is a quick test using the Eleven v3 model.")
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [stats, setStats] = useState<MetricStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const heroName = profile?.display_name || 'Voice Adventurer'
  const [avatarOptions, setAvatarOptions] = useState<AvatarOptions>({})
  const [isCustomizationModalOpen, setIsCustomizationModalOpen] = useState(false)

  const statCards = useMemo(() => ([
    {
      label: 'Rooms hosted',
      value: stats ? stats.roomsHosted.toString() : statsLoading ? '—' : '0',
      helper: 'Sessions you kicked off',
    },
    {
      label: 'Games played',
      value: stats ? stats.gamesPlayed.toString() : statsLoading ? '—' : '0',
      helper: 'Total rounds joined',
    },
    {
      label: 'AI takeovers',
      value: stats ? stats.aiMoments.toString() : statsLoading ? '—' : '0',
      helper: 'Times you let the persona speak',
    },
    {
      label: 'Detection accuracy',
      value: stats && stats.detectorAccuracy !== null ? `${stats.detectorAccuracy}%` : statsLoading ? '—' : '—',
      helper: 'As the detector',
    },
  ]), [stats, statsLoading])

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) { setLoading(false); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
      if (data) {
        setProfile(data as any)
        if (data.avatar_options) {
          setAvatarOptions(data.avatar_options as AvatarOptions)
        }
      }
      setLoading(false)
    })()
  }, [])

  // Fetch ElevenLabs voice metadata if we have an ID
  useEffect(() => {
    (async () => {
      if (!profile?.elevenlabs_voice_id) { setVoiceInfo(null); return }
      try {
        const r = await fetch(`/api/elevenlabs/voice?voiceId=${encodeURIComponent(profile.elevenlabs_voice_id)}`)
        if (!r.ok) throw new Error('Failed to fetch voice info')
        const j = await r.json()
        setVoiceInfo({ id: j.id, name: j.name, category: j.category })
      } catch (e) {
        setVoiceInfo(null)
      }
    })()
  }, [profile?.elevenlabs_voice_id])

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    setStatsLoading(true)
    ;(async () => {
      try {
        const uid = profile.id
        const [rooms, games, ai, guesses] = await Promise.all([
          supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('created_by', uid),
          supabase.from('participants').select('room_id', { count: 'exact', head: true }).eq('uid', uid),
          supabase.from('events').select('id', { count: 'exact', head: true }).eq('uid', uid).eq('type', 'ai-activated'),
          supabase.from('participants').select('guess_correct').eq('uid', uid).eq('guess_used', true),
        ])
        if (cancelled) return
        if (rooms.error) throw rooms.error
        if (games.error) throw games.error
        if (ai.error) throw ai.error
        if (guesses.error) throw guesses.error

        const totalGuesses = guesses.data?.length ?? 0
        const detectorAccuracy = totalGuesses ? Math.round(((guesses.data?.filter(g => g.guess_correct).length ?? 0) / totalGuesses) * 100) : null

        setStats({
          roomsHosted: rooms.count ?? 0,
          gamesPlayed: games.count ?? 0,
          aiMoments: ai.count ?? 0,
          detectorAccuracy,
        })
      } catch (error) {
        if (!cancelled) {
          setStats(null)
        }
      } finally {
        if (!cancelled) setStatsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [profile?.id])

  async function handleAvatarSave(newSeed: string, newOptions: AvatarOptions) {
    if (!profile) return
    
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) return
    
    const { error } = await supabase.from('profiles').upsert({
      id: uid,
      avatar_seed: newSeed,
      avatar_options: newOptions,
      updated_at: new Date().toISOString(),
    })
    
    if (!error) {
      setProfile({ ...profile, avatar_seed: newSeed, avatar_options: newOptions })
      setAvatarOptions(newOptions)
      setMessage('Avatar saved successfully!')
      setTimeout(() => setMessage(null), 3000)
    } else {
      setMessage('Failed to save avatar')
    }
  }

  async function save() {
    setMessage(null)
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) return
    const upsert = {
      id: uid,
      display_name: profile?.display_name ?? null,
      elevenlabs_voice_id: profile?.elevenlabs_voice_id ?? null,
      avatar_seed: profile?.avatar_seed ?? null,
      avatar_options: avatarOptions,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('profiles').upsert(upsert)
    if (error) setMessage(error.message)
    else setMessage('Saved')
  }

  async function createInstantClone(blob: Blob) {
    if (!profile) return
    setMessage(null)
    setIvcBusy(true)
    try {
      const fd = new FormData()
      fd.set('name', profile.display_name || 'My Voice Clone')
      fd.set('file', blob, 'sample.webm')
      const resp = await fetch('/api/elevenlabs/ivc', { method: 'POST', body: fd })
      const text = await resp.text()
      if (!resp.ok) throw new Error(text)
      const json = JSON.parse(text)
      const vid = json.voiceId as string
      // Save to profile
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (uid) {
        await supabase.from('profiles').upsert({ id: uid, elevenlabs_voice_id: vid, updated_at: new Date().toISOString() })
        setProfile({ ...(profile as any), elevenlabs_voice_id: vid })
        setMessage('Instant clone created and linked!')
      }
    } catch (e: any) {
      setMessage(e?.message || 'Failed to create instant clone')
    } finally {
      setIvcBusy(false)
    }
  }

  async function ttsSpeak() {
    if (!profile?.elevenlabs_voice_id) return
    setTtsBusy(true)
    try {
      const resp = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Prefer v3; the API route will fallback automatically if needed.
        body: JSON.stringify({ voiceId: profile.elevenlabs_voice_id, text: ttsText, modelId: 'eleven_v3' })
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => null)
        throw new Error(err?.error || 'TTS failed')
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      if (!audioRef.current) return
      audioRef.current.src = url
      audioRef.current.play().catch(() => {})
    } catch (e: any) {
      setMessage(e?.message || 'TTS failed')
    } finally {
      setTtsBusy(false)
    }
  }

  if (loading) return <div className="py-24 text-center text-lg">Loading your profile...</div>
  if (!profile) return (
    <div className="py-24 text-center space-y-4">
      <p className="text-base">Sign in to unlock your profile dashboard.</p>
      <Link href="/auth/signin"><Button>Sign in</Button></Link>
    </div>
  )

  return (
    <div className="space-y-10 pb-16">
      <AvatarCustomizationModal
        isOpen={isCustomizationModalOpen}
        onClose={() => setIsCustomizationModalOpen(false)}
        currentSeed={profile?.avatar_seed || generateRandomSeed()}
        currentOptions={avatarOptions}
        onSave={handleAvatarSave}
      />
      
      <section className="texture-panel">
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="flex-1 space-y-4">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Profile HQ</p>
            <h1 className="heading-font text-4xl sm:text-[44px] leading-tight">Welcome back, {heroName}.</h1>
            <p className="text-base text-muted-foreground max-w-2xl">
              Track your wins, monitor your clones, and prep for the next ElevenLabs-powered showdown.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/"><Button variant="outline">← Back home</Button></Link>
              <Link href="/r/new"><Button variant="secondary">Start a new room</Button></Link>
            </div>
          </div>
          
          <div className="flex flex-col items-center space-y-3 flex-shrink-0">
            {profile?.avatar_seed ? (
              <>
                <img 
                  src={generateAvatarUrl(profile.avatar_seed, avatarOptions)} 
                  alt="Your avatar" 
                  className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl border-2 border-border shadow-lg"
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setIsCustomizationModalOpen(true)}
                >
                  Customize
                </Button>
              </>
            ) : (
              <>
                <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl border-2 border-dashed border-border bg-muted/50 flex items-center justify-center text-4xl">
                  👤
                </div>
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={() => setIsCustomizationModalOpen(true)}
                >
                  Create Avatar
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="card-grid">
          {statCards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-border/80 bg-white/80 px-5 py-5 shadow-sm">
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{card.label}</div>
              <div className="heading-font text-3xl mt-3">{card.value}</div>
              <div className="text-xs text-muted-foreground mt-2">{card.helper}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="space-y-2">
            <div className="heading-font text-2xl">Identity &amp; access</div>
            <p className="text-sm text-muted-foreground">Keep your display name and linked voice ID up to date.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Display name</div>
              <Input value={profile.display_name ?? ''} onChange={e => setProfile({ ...(profile as any), display_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">ElevenLabs Voice ID</div>
              <Input placeholder="elevenlabs voice id" value={profile.elevenlabs_voice_id ?? ''} onChange={e => setProfile({ ...(profile as any), elevenlabs_voice_id: e.target.value })} />
              <p className="text-xs text-muted-foreground">Paste a Professional clone ID or use the instant clone tool to generate one.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={save}>Save changes</Button>
              {message && <span className="text-sm text-[#1F4B3A]">{message}</span>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2">
            <div className="heading-font text-2xl">Voice status</div>
            <p className="text-sm text-muted-foreground">Manage your ElevenLabs persona and audition it instantly.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile.elevenlabs_voice_id ? (
              <div className="space-y-3">
                <div className="text-sm">
                  Connected: <span className="font-medium">{voiceInfo?.name || profile.elevenlabs_voice_id}</span>
                  {voiceInfo?.category ? <span className="text-muted-foreground"> ({voiceInfo.category})</span> : null}
                </div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Quick v3 test line</div>
                  <Input className="flex-1" value={ttsText} onChange={(e) => setTtsText(e.target.value)} />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={ttsSpeak} disabled={ttsBusy}>{ttsBusy ? 'Generating...' : 'Play sample'}</Button>
                    <audio ref={audioRef} controls className="h-10 w-full max-w-[240px]" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">No clone attached yet. Record a 10s snippet and we&apos;ll hit ElevenLabs instant cloning for you.</p>
                <VoiceRecorder label={ivcBusy ? 'Uploading...' : 'Record 10s & Create'} seconds={10} onFinish={(blob) => !ivcBusy && createInstantClone(blob)} />
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="w-full">
          <CardHeader className="space-y-2">
            <div className="heading-font text-2xl">Game shortcuts</div>
            <p className="text-sm text-muted-foreground">Jump straight into your next deception challenge.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="rounded-2xl border border-border/80 p-4 bg-gradient-to-br from-[#F3EFE8] to-[#E6E0D6]">
                <div className="text-sm font-medium">Host a fresh room</div>
                <p className="text-xs text-muted-foreground mt-1">Generate a shareable code and auto-start the lobby.</p>
                <Link href="/r/new"><Button className="mt-3" size="sm">Create room</Button></Link>
              </div>
              <div className="rounded-2xl border border-border/80 p-4">
                <div className="text-sm font-medium">Join with a code</div>
                <p className="text-xs text-muted-foreground mt-1">Already have a friend&apos;s room ID? Drop in instantly.</p>
                <Link href="/join"><Button variant="outline" size="sm" className="mt-3">Join room</Button></Link>
              </div>
              <div className="rounded-2xl border border-border/80 p-4">
                <div className="text-sm font-medium">Refine your vibe</div>
                <p className="text-xs text-muted-foreground mt-1">Update onboarding info or review quick tips.</p>
                <Link href="/onboarding"><Button variant="ghost" size="sm" className="mt-3">Edit onboarding</Button></Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
