"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Timer } from '@/components/Timer'
import { ChunkedRecorder } from '@/lib/recorder'
import { supabase, functionsUrl, getAccessToken } from '@/lib/supabase'
import { fnActivateAI, fnDetectorGuess } from '@/lib/functions'

const MODERATOR_VOICE_ID = 'kdmDKE6EkgrWrrykO9Qt'
const AI_MAX_SECONDS = 180

type RoomInfo = {
  id: string
  topic: string | null
  created_by: string | null
  target_uid: string | null
  detector_uid: string | null
  ai_activated_at: string | null
  started_at: string | null
  status: string | null
}

type Participant = { uid: string; display_name: string | null; joined_at: string }
type TranscriptLine = { id: number; text: string; uid: string | null; created_at: string }

export default function TalkPage({ params }: { params: { roomId: string } }) {
  const roomId = params.roomId
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([])
  const transcriptsRef = useRef<string[]>([])
  const [liveDraft, setLiveDraft] = useState('')
  const [question, setQuestion] = useState('')
  const [moderatorMessages, setModeratorMessages] = useState<{ id: string; text: string }[]>([])
  const [moderatorBusy, setModeratorBusy] = useState(false)
  const moderatorAudioRef = useRef<HTMLAudioElement | null>(null)
  const [introPlayed, setIntroPlayed] = useState(false)
  const [timerStart, setTimerStart] = useState(0)
  const [muted, setMuted] = useState(false)
  const recRef = useRef<ChunkedRecorder | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestionLoading, setSuggestionLoading] = useState(false)
  const [aiCountdown, setAiCountdown] = useState(0)
  const [aiFinished, setAiFinished] = useState(false)
  const aiAnnounced = useRef(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [detectorResult, setDetectorResult] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!active) return
      if (!auth.user) {
        router.replace(`/auth/signin?redirectTo=${encodeURIComponent(`/r/${roomId}/talk`)}`)
        return
      }
      setUserId(auth.user.id)
    })()
    return () => { active = false }
  }, [roomId, router])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.from('participants').select('uid, display_name, joined_at').eq('room_id', roomId)
      if (mounted) setParticipants((data ?? []) as Participant[])
    })()
    const channel = supabase.channel(`talk-${roomId}-participants`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `room_id=eq.${roomId}` }, (payload) => {
        setParticipants((prev) => {
          if (payload.eventType === 'INSERT') return [...prev, payload.new as Participant]
          if (payload.eventType === 'UPDATE') return prev.map((row) => row.uid === payload.new.uid ? (payload.new as Participant) : row)
          if (payload.eventType === 'DELETE') return prev.filter((row) => row.uid !== payload.old.uid)
          return prev
        })
      })
      .subscribe()
    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [roomId])

  useEffect(() => {
    if (!userId) return
    let mounted = true
    ;(async () => {
      const { data } = await supabase
        .from('rooms')
        .select('id, topic, created_by, target_uid, detector_uid, ai_activated_at, started_at, status')
        .eq('id', roomId)
        .maybeSingle()
      if (mounted && data) setRoom(data as RoomInfo)
    })()
    const channel = supabase.channel(`talk-${roomId}-meta`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
        setRoom(payload.new as RoomInfo)
      })
      .subscribe()
    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [roomId, userId])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase
        .from('transcripts')
        .select('id, text, uid, created_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(200)
      if (mounted) setTranscripts((data ?? []) as TranscriptLine[])
    })()
    const channel = supabase.channel(`talk-${roomId}-transcripts`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transcripts', filter: `room_id=eq.${roomId}` }, (payload) => {
        setTranscripts((prev) => [...prev, payload.new as TranscriptLine])
      })
      .subscribe()
    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [roomId])

  useEffect(() => {
    transcriptsRef.current = transcripts.slice(-6).map((line) => line.text)
  }, [transcripts])

  useEffect(() => {
    if (!room?.started_at) return
    const startSeconds = Math.max(0, Math.floor((Date.now() - new Date(room.started_at).getTime()) / 1000))
    setTimerStart(startSeconds)
  }, [room?.started_at])

  useEffect(() => {
    if (!room?.ai_activated_at) {
      setAiCountdown(0)
      setAiFinished(false)
      aiAnnounced.current = false
      return
    }
    const started = new Date(room.ai_activated_at).getTime()
    const tick = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - started) / 1000))
      setAiCountdown(elapsed)
      if (elapsed >= AI_MAX_SECONDS) setAiFinished(true)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [room?.ai_activated_at])

  useEffect(() => {
    if (!room || introPlayed) return
    playModeratorIntro()
  }, [room, introPlayed])

  useEffect(() => {
    if (!room?.ai_activated_at || !aiFinished || aiAnnounced.current) return
    aiAnnounced.current = true
    const readable = formatSeconds(aiCountdown)
    playModeratorLine(`Time! The AI persona held the mic for ${readable}. Wrapping the round now.`)
  }, [room?.ai_activated_at, aiFinished, aiCountdown])

  const fetchSuggestions = useCallback(async () => {
    setSuggestionLoading(true)
    try {
      const resp = await fetch('/api/groq/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcriptsRef.current })
      })
      if (resp.ok) {
        const data = await resp.json()
        setSuggestions(data.suggestions ?? [])
      }
    } catch (_) {
      // ignore
    } finally {
      setSuggestionLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSuggestions()
    const id = setInterval(fetchSuggestions, 10000)
    return () => clearInterval(id)
  }, [fetchSuggestions])

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    async function startRecorder() {
      try {
        recRef.current = new ChunkedRecorder({
          timesliceMs: 1200,
          onChunk: async (blob, seq) => {
            if (muted || !userId) return
            try {
              const chunkKey = `${Date.now()}-${seq}`
              await supabase.storage.from('recordings').upload(
                `rooms/${roomId}/utterances/${chunkKey}.webm`,
                blob,
                { upsert: true, contentType: 'audio/webm', metadata: { uid: userId } as any }
              )
              const token = await getAccessToken()
              const fxUrl = `${functionsUrl()}/transcribe-chunk?roomId=${encodeURIComponent(roomId)}&chunkId=${chunkKey}&seq=${seq}`
              const res = await fetch(fxUrl, {
                method: 'POST',
                headers: { 'Authorization': token ? `Bearer ${token}` : '', 'Content-Type': 'audio/webm' },
                body: blob,
              })
              const data = await res.json()
              if (data?.text && !cancelled) {
                setLiveDraft((prev) => ((prev ? prev + ' ' : '') + data.text).trim().slice(-400))
              }
            } catch (_) {
              // ignore chunk errors
            }
          }
        })
        await recRef.current.start()
      } catch (_) {
        // mic unavailable
      }
    }
    startRecorder()
    return () => { cancelled = true; recRef.current?.stop(); recRef.current = null }
  }, [roomId, userId, muted])

  const role = useMemo(() => {
    if (!room || !userId) return null
    if (room.target_uid === userId) return 'target'
    if (room.detector_uid === userId) return 'detector'
    if (room.created_by === userId) return 'host'
    return 'guest'
  }, [room, userId])

  const topic = room?.topic || 'Freestyle banter'
  const aiActive = !!room?.ai_activated_at && !aiFinished

  function nameFor(uid: string | null) {
    if (!uid) return 'System'
    if (uid === userId) return 'You'
    return participants.find((p) => p.uid === uid)?.display_name || 'Player'
  }

  function formatSeconds(sec: number) {
    const mm = Math.floor(sec / 60)
    const ss = (sec % 60).toString().padStart(2, '0')
    return `${mm}:${ss}`
  }

  async function speakModerator(text: string) {
    try {
      const resp = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId: MODERATOR_VOICE_ID, text, modelId: 'eleven_v3' })
      })
      if (!resp.ok) return false
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const audio = moderatorAudioRef.current ?? new Audio()
      audio.src = url
      await audio.play()
      moderatorAudioRef.current = audio
      return true
    } catch (_) {
      return false
    }
  }

  async function playModeratorLine(text: string) {
    setModeratorMessages((prev) => [...prev, { id: crypto.randomUUID(), text }])
    return speakModerator(text)
  }

  async function playModeratorIntro(manual = false) {
    if (!room) return
    const hostName = nameFor(room.created_by)
    const script = `Hey ${hostName}! I am your ElevenLabs moderator. Chat naturally, the host can unleash their AI persona anytime for up to three minutes, and the detector gets one confident guess. Ask me anything if you need help.`
    const ok = await playModeratorLine(script)
    if (ok) setIntroPlayed(true)
    else if (!manual) {
      setModeratorMessages((prev) => [...prev, { id: crypto.randomUUID(), text: 'Tap the Replay Intro button so I can give the rundown.' }])
    }
  }

  async function handleAskModerator() {
    if (!question.trim()) return
    setModeratorBusy(true)
    try {
      const resp = await fetch('/api/groq/moderator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, transcript: transcriptsRef.current })
      })
      const data = await resp.json()
      const answer = data?.answer || 'Keep rolling with it!'
      setQuestion('')
      await playModeratorLine(answer)
    } catch (_) {
      setModeratorMessages((prev) => [...prev, { id: crypto.randomUUID(), text: 'Moderator: I could not reach Groq right now.' }])
    } finally {
      setModeratorBusy(false)
    }
  }

  async function handleActivateAI() {
    setAiBusy(true)
    try {
      await fnActivateAI(roomId)
      playModeratorLine('Persona coming online. Host, pace your delivery—detector, keep your ears sharp!')
    } catch (e: any) {
      setModeratorMessages((prev) => [...prev, { id: crypto.randomUUID(), text: e?.message || 'Could not activate AI just yet.' }])
    } finally {
      setAiBusy(false)
    }
  }

  async function handleDetectorGuess() {
    try {
      const { correct } = await fnDetectorGuess(roomId)
      const line = correct
        ? 'Detector nailed it. AI era is over—chalk up the win!'
        : 'Nope! That was still your friend. Detector loses this round.'
      setDetectorResult(correct ? 'You caught the AI persona!' : 'It was still human. Round over!')
      await playModeratorLine(line)
    } catch (e: any) {
      setDetectorResult(e?.message || 'Guess failed')
    }
  }

  if (!userId || !room) {
    return <div className="py-24 text-center text-lg">Loading the call experience…</div>
  }

  return (
    <div className="space-y-8 pb-16">
      <section className="texture-panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Live conversation</p>
            <h1 className="heading-font text-3xl sm:text-[40px]">{topic}</h1>
          </div>
          <div className="text-sm text-muted-foreground">Elapsed • <Timer start={timerStart} /></div>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">Groq keeps the transcript rolling while ElevenLabs powers the voices. Flow naturally, stay alert.</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((idx) => {
              const entry = participants[idx]
              const label = entry ? nameFor(entry.uid) : idx === 0 ? 'Host' : 'Guest'
              const personaActive = aiActive && entry?.uid === room.created_by
              return (
                <div key={idx} className="rounded-3xl border border-border/80 bg-gradient-to-br from-[#F3EFE8] to-[#E3DDD3] p-5 h-52 flex flex-col justify-between">
                  <div className="text-sm uppercase tracking-[0.3em] text-muted-foreground">{idx === 0 ? 'Speaker A' : 'Speaker B'}</div>
                  <div className="heading-font text-2xl">{label}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#1F4B3A]"></span>
                    {personaActive ? 'AI persona live' : 'Human voice'}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="rounded-3xl border border-border/80 bg-white/80 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Waveform</div>
                <div className="text-xs text-muted-foreground">{muted ? 'Muted' : 'Streaming audio'}</div>
              </div>
              <Button variant="outline" onClick={() => setMuted((m) => !m)}>{muted ? 'Unmute mic' : 'Mute mic'}</Button>
            </div>
            <div className={`wave-bars ${muted ? 'muted' : ''}`}>
              {Array.from({ length: 32 }).map((_, i) => (
                <span key={i} style={{ height: `${20 + (i % 5) * 15}%`, ['--delay' as any]: `${i * 40}ms` }} />
              ))}
            </div>
          </div>

          <Card>
            <CardHeader className="space-y-2">
              <div className="heading-font text-2xl">Transcript</div>
              <p className="text-sm text-muted-foreground">Powered by Groq Whisper Turbo</p>
            </CardHeader>
            <CardContent className="space-y-4 max-h-96 overflow-y-auto">
              {transcripts.map((line) => (
                <div key={line.id} className="rounded-2xl border border-border/60 p-3 bg-white/80">
                  <div className="text-xs text-muted-foreground">{nameFor(line.uid)} · {new Date(line.created_at).toLocaleTimeString()}</div>
                  <div className="text-sm mt-1">{line.text}</div>
                </div>
              ))}
              {liveDraft && (
                <div className="rounded-2xl border border-dashed border-border/60 p-3 bg-white/60">
                  <div className="text-xs text-muted-foreground">You (live)</div>
                  <div className="text-sm mt-1 opacity-70">{liveDraft}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-1">
              <div className="heading-font text-2xl">Moderator</div>
              <p className="text-sm text-muted-foreground">ElevenLabs voice coach</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button variant="outline" onClick={() => playModeratorIntro(true)}>Replay intro</Button>
              <div className="space-y-3 max-h-48 overflow-y-auto text-sm">
                {moderatorMessages.map((msg) => (
                  <div key={msg.id} className="rounded-2xl border border-border/60 bg-white/80 p-3">{msg.text}</div>
                ))}
              </div>
              <div className="space-y-2">
                <Textarea placeholder="Ask the moderator anything" value={question} onChange={(e) => setQuestion(e.target.value)} />
                <Button onClick={handleAskModerator} disabled={moderatorBusy}>{moderatorBusy ? 'Thinking…' : 'Ask moderator'}</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <div className="heading-font text-2xl">Groq topic sparks</div>
              <p className="text-sm text-muted-foreground">New ideas every 10 seconds</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {suggestions.map((idea) => (
                  <span key={idea} className="px-3 py-1 rounded-full bg-[#E7E2DA] text-xs">{idea}</span>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={fetchSuggestions} disabled={suggestionLoading}>{suggestionLoading ? 'Refreshing…' : 'Refresh now'}</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <div className="heading-font text-2xl">Controls</div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {room.created_by === userId && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">AI persona window ({formatSeconds(Math.min(aiCountdown, AI_MAX_SECONDS))} / {formatSeconds(AI_MAX_SECONDS)})</div>
                  <div className="h-2 rounded-full bg-[#E2DBD3]">
                    <div className={`h-2 rounded-full ${aiActive ? 'bg-[#1F4B3A]' : 'bg-[#B6ADA6]'}`} style={{ width: `${Math.min(100, (aiCountdown / AI_MAX_SECONDS) * 100)}%` }} />
                  </div>
                  <Button onClick={handleActivateAI} disabled={aiActive || aiBusy}>
                    {aiActive ? 'Persona live' : aiBusy ? 'Warming up…' : 'Let AI persona take over'}
                  </Button>
                </div>
              )}
              {role === 'detector' && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">One guess. Use it wisely.</div>
                  <Button variant="secondary" onClick={handleDetectorGuess}>Call it: AI is speaking</Button>
                  {detectorResult && <div className="text-xs text-muted-foreground">{detectorResult}</div>}
                </div>
              )}
              <Button variant="ghost" onClick={() => router.push('/')}>Leave call</Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
