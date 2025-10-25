"use client"
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Room, RoomEvent, Track, RemoteTrackPublication, RemoteParticipant } from 'livekit-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Timer } from '@/components/Timer'
import { MicSelector } from '@/components/ui/mic-selector'
import { ScrollingWaveform } from '@/components/ui/waveform'
import { supabase, getAccessToken, functionsUrl } from '@/lib/supabase'
import { fnActivateAI, fnDetectorGuess } from '@/lib/functions'
import { publishAudioBlob, setLocalAudioEnabled } from '@/lib/livekit-audio'
import { DeepgramLiveTranscriber } from '@/lib/deepgram-transcription'

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
type TranscriptLine = { id: number; text: string; uid: string | null; created_at: string; speaker_id?: number | null }

export default function TalkPage({ params }: { params: { roomId: string } }) {
  const roomId = params.roomId
  const router = useRouter()
  
  // Auth & room state
  const [userId, setUserId] = useState<string | null>(null)
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  
  // LiveKit state
  const livekitRoom = useRef<Room | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [remoteParticipants, setRemoteParticipants] = useState<string[]>([])
  const [isSpeaking, setIsSpeaking] = useState<Record<string, boolean>>({})
  
  // Transcript state
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([])
  const transcriptsRef = useRef<string[]>([])
  
  // Moderator state
  const [question, setQuestion] = useState('')
  const [moderatorMessages, setModeratorMessages] = useState<{ id: string; text: string }[]>([])
  const [moderatorBusy, setModeratorBusy] = useState(false)
  const [introPlayed, setIntroPlayed] = useState(false)
  
  // Timer state
  const [timerStart, setTimerStart] = useState(0)
  
  // AI persona state
  const [aiCountdown, setAiCountdown] = useState(0)
  const [aiFinished, setAiFinished] = useState(false)
  const aiAnnounced = useRef(false)
  const [aiBusy, setAiBusy] = useState(false)
  const aiLoopInterval = useRef<NodeJS.Timeout | null>(null)
  
  // Detector state
  const [detectorResult, setDetectorResult] = useState<string | null>(null)
  
  // Topic suggestions
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestionLoading, setSuggestionLoading] = useState(false)
  
  // Deepgram transcription
  const deepgramRef = useRef<DeepgramLiveTranscriber | null>(null)
  
  // Mic controls
  const [selectedMic, setSelectedMic] = useState('')
  const [isMicMuted, setIsMicMuted] = useState(false)

  // Get user auth
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

  // Load participants and room data from API (bypasses RLS)
  useEffect(() => {
    if (!userId) return
    let mounted = true
    
    async function fetchRoomData() {
      try {
        const { data: session } = await supabase.auth.getSession()
        const token = session.session?.access_token
        
        const response = await fetch('/api/functions/get-room', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
          },
          body: JSON.stringify({ roomId }),
        })
        
        if (response.ok) {
          const data = await response.json()
          if (mounted) {
            setParticipants(data.participants as Participant[])
            if (data.room) setRoom(data.room as RoomInfo)
          }
        }
      } catch (err) {
        console.error('Failed to fetch room data:', err)
      }
    }
    
    // Fetch initial data
    fetchRoomData()
    
    // Subscribe to realtime updates for participants
    const participantsChannel = supabase.channel(`talk-${roomId}-participants`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `room_id=eq.${roomId}` }, (payload) => {
        setParticipants((prev) => {
          if (payload.eventType === 'INSERT') return [...prev, payload.new as Participant]
          if (payload.eventType === 'UPDATE') return prev.map((row) => row.uid === payload.new.uid ? (payload.new as Participant) : row)
          if (payload.eventType === 'DELETE') return prev.filter((row) => row.uid !== payload.old.uid)
          return prev
        })
      })
      .subscribe()
    
    // Subscribe to realtime updates for room
    const roomChannel = supabase.channel(`talk-${roomId}-meta`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
        setRoom(payload.new as RoomInfo)
      })
      .subscribe()
    
    return () => { 
      mounted = false
      supabase.removeChannel(participantsChannel)
      supabase.removeChannel(roomChannel)
    }
  }, [roomId, userId])

  // Load transcripts
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

  // Update transcript ref
  useEffect(() => {
    transcriptsRef.current = transcripts.slice(-12).map((line) => line.text)
  }, [transcripts])

  // Set timer
  useEffect(() => {
    if (!room?.started_at) return
    const startSeconds = Math.max(0, Math.floor((Date.now() - new Date(room.started_at).getTime()) / 1000))
    setTimerStart(startSeconds)
  }, [room?.started_at])

  // AI countdown timer
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
      if (elapsed >= AI_MAX_SECONDS) {
        setAiFinished(true)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [room?.ai_activated_at])
  
  // Calculate aiActive
  const aiActive = !!room?.ai_activated_at && !aiFinished

  // Connect to LiveKit room
  useEffect(() => {
    if (!userId || !roomId) return

    let mounted = true
    const lkRoom = new Room()
    livekitRoom.current = lkRoom

    async function connect() {
      try {
        const token = await getAccessToken()
        const response = await fetch('/api/livekit/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : '',
          },
          body: JSON.stringify({ roomId }),
        })

        if (!response.ok) {
          throw new Error('Failed to get LiveKit token')
        }

        const { token: lkToken, url } = await response.json()

        await lkRoom.connect(url, lkToken)
        
        if (mounted) {
          setIsConnected(true)
          
          // Enable local microphone
          await lkRoom.localParticipant.setMicrophoneEnabled(true)
        }
      } catch (error) {
        console.error('LiveKit connection error:', error)
      }
    }

    // Handle remote participants
    lkRoom.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      setRemoteParticipants((prev) => [...prev, participant.identity])
    })

    lkRoom.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      setRemoteParticipants((prev) => prev.filter((id) => id !== participant.identity))
    })

    // Handle audio tracks
    lkRoom.on(RoomEvent.TrackSubscribed, (track, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Audio) {
        const audioElement = track.attach()
        document.body.appendChild(audioElement)
        audioElement.play()
      }
    })

    lkRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((element) => element.remove())
    })

    // Handle speaking indicators
    lkRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const speakingMap: Record<string, boolean> = {}
      speakers.forEach((speaker) => {
        speakingMap[speaker.identity] = true
      })
      setIsSpeaking(speakingMap)
    })

    connect()

    return () => {
      mounted = false
      lkRoom.disconnect()
      livekitRoom.current = null
      setIsConnected(false)
    }
  }, [userId, roomId])

  // Handle mute/unmute
  useEffect(() => {
    if (!livekitRoom.current || !isConnected) return
    setLocalAudioEnabled(livekitRoom.current, !isMicMuted)
  }, [isMicMuted, isConnected])

  // Start Deepgram live transcription - TRUE real-time streaming!
  useEffect(() => {
    if (!userId || !isConnected || aiActive) return

    const DEEPGRAM_API_KEY = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY

    if (!DEEPGRAM_API_KEY) {
      console.error('[Deepgram] API key not found in environment')
      return
    }

    async function startDeepgram() {
      try {
        console.log('[Deepgram] Starting live transcription...')

        deepgramRef.current = new DeepgramLiveTranscriber(
          DEEPGRAM_API_KEY!,
          // On transcript callback
          async (data) => {
            if (!data.isFinal || !data.transcript || data.transcript.trim().length === 0) {
              // Only save final transcripts with actual content
              return
            }

            console.log(`[Deepgram] Final transcript from speaker ${data.speaker}:`, data.transcript)

            // Save to Supabase
            try {
              const { error } = await supabase
                .from('transcripts')
                .insert({
                  room_id: roomId,
                  uid: userId,
                  text: data.transcript,
                  speaker_id: data.speaker,
                  // Add timing data from first and last word
                  start_ms: data.words && data.words.length > 0
                    ? Math.floor(data.words[0].start * 1000)
                    : null,
                  end_ms: data.words && data.words.length > 0
                    ? Math.floor(data.words[data.words.length - 1].end * 1000)
                    : null,
                })

              if (error) {
                console.error('[Deepgram] Failed to save transcript:', error)
              } else {
                console.log('[Deepgram] Transcript saved to database')
              }
            } catch (error) {
              console.error('[Deepgram] Error saving transcript:', error)
            }
          },
          // On error callback
          (error) => {
            console.error('[Deepgram] Transcription error:', error)
          }
        )

        await deepgramRef.current.start()
        console.log('[Deepgram] Live transcription started successfully!')
      } catch (error) {
        console.error('[Deepgram] Failed to start:', error)
      }
    }

    startDeepgram()

    return () => {
      console.log('[Deepgram] Cleaning up...')
      deepgramRef.current?.stop()
      deepgramRef.current = null
    }
  }, [roomId, userId, isConnected, aiActive])

  // Play intro when room loads
  useEffect(() => {
    if (!room || introPlayed || !isConnected) return
    playModeratorIntro()
  }, [room, introPlayed, isConnected])

  // Announce AI timeout
  useEffect(() => {
    if (!room?.ai_activated_at || !aiFinished || aiAnnounced.current) return
    aiAnnounced.current = true
    stopAILoop()
    const readable = formatSeconds(aiCountdown)
    playModeratorLine(`Time! The AI persona held the mic for ${readable}. Game over. The detector did not catch it in time.`)
  }, [room?.ai_activated_at, aiFinished, aiCountdown])

  // Fetch topic suggestions
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
    // Only fetch suggestions after LiveKit is connected
    if (!isConnected) return
    
    fetchSuggestions()
    const id = setInterval(fetchSuggestions, 30000)
    return () => clearInterval(id)
  }, [fetchSuggestions, isConnected])

  // Helper functions
  const role = (() => {
    if (!room || !userId) return null
    if (room.target_uid === userId) return 'target'
    if (room.detector_uid === userId) return 'detector'
    if (room.created_by === userId) return 'host'
    return 'guest'
  })()

  const topic = room?.topic || 'Freestyle banter'
  const isHost = room?.created_by === userId

  // Debug role
  useEffect(() => {
    if (room && userId) {
      console.log('Role debug:', {
        userId,
        role,
        target_uid: room.target_uid,
        detector_uid: room.detector_uid,
        created_by: room.created_by
      })
    }
  }, [role, room, userId])

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
        body: JSON.stringify({ voiceId: MODERATOR_VOICE_ID, text, modelId: 'eleven_turbo_v2_5' })
      })
      if (!resp.ok) return false
      const blob = await resp.blob()
      
      // Publish to LiveKit room so both participants hear it
      if (livekitRoom.current && isConnected) {
        await publishAudioBlob(livekitRoom.current, blob, 'moderator')
      }
      
      return true
    } catch (error) {
      console.error('Moderator speak error:', error)
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

  async function generateAndSpeakAI() {
    if (!livekitRoom.current || !isConnected || aiFinished) return

    try {
      const token = await getAccessToken()
      
      // Generate AI response
      const resp = await fetch('/api/ai-persona', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          roomId,
          recentTranscripts: transcriptsRef.current,
        }),
      })

      if (!resp.ok) {
        console.error('AI persona generation failed')
        return
      }

      const { text, voiceId } = await resp.json()

      // Convert to speech
      const ttsResp = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId, text, modelId: 'eleven_turbo_v2_5' })
      })

      if (!ttsResp.ok) {
        console.error('TTS failed')
        return
      }

      const audioBlob = await ttsResp.blob()

      // Publish as host's audio
      if (livekitRoom.current && isConnected) {
        await publishAudioBlob(livekitRoom.current, audioBlob, 'ai-persona')
      }

      // Insert into transcript
      await supabase.from('transcripts').insert({
        room_id: roomId,
        uid: userId,
        text,
        created_at: new Date().toISOString(),
      })
    } catch (error) {
      console.error('AI generation error:', error)
    }
  }

  function startAILoop() {
    if (aiLoopInterval.current) return
    
    // Generate first response immediately
    generateAndSpeakAI()
    
    // Then generate new responses every 8-12 seconds
    aiLoopInterval.current = setInterval(() => {
      if (aiFinished) {
        stopAILoop()
        return
      }
      generateAndSpeakAI()
    }, 10000)
  }

  function stopAILoop() {
    if (aiLoopInterval.current) {
      clearInterval(aiLoopInterval.current)
      aiLoopInterval.current = null
    }
  }

  async function handleActivateAI() {
    if (!livekitRoom.current || !isConnected) return
    
    setAiBusy(true)
    try {
      await fnActivateAI(roomId)
      
      // Mute local microphone
      await setLocalAudioEnabled(livekitRoom.current, false)
      
      playModeratorLine('Persona coming online. Host, pace your delivery—detector, keep your ears sharp!')
      
      // Start AI generation loop
      startAILoop()
    } catch (e: any) {
      setModeratorMessages((prev) => [...prev, { id: crypto.randomUUID(), text: e?.message || 'Could not activate AI just yet.' }])
    } finally {
      setAiBusy(false)
    }
  }

  async function handleDetectorGuess() {
    try {
      const { correct } = await fnDetectorGuess(roomId)
      
      stopAILoop()
      
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
    <div className="min-h-screen flex flex-col p-4 gap-4">
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {isConnected ? 'Connected' : 'Connecting...'}
        </div>
        <div className="text-sm text-muted-foreground">Elapsed • <Timer start={timerStart} /></div>
        <Button variant="outline" size="sm" onClick={() => router.push('/')}>
          End Call
        </Button>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {/* Participant Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((idx) => {
              const entry = participants[idx]
              const label = entry ? nameFor(entry.uid) : idx === 0 ? 'Host' : 'Guest'
              const personaActive = aiActive && entry?.uid === room.target_uid
              const isCurrentlySpeaking = entry && isSpeaking[entry.uid]
              const isYou = entry?.uid === userId
              
              return (
                <div key={idx} className="rounded-2xl border border-border/80 bg-gradient-to-br from-[#F3EFE8] to-[#E3DDD3] p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {idx === 0 ? 'Speaker A' : 'Speaker B'}
                      </div>
                      <div className="heading-font text-lg">{label}</div>
                      {isYou && <span className="text-xs text-[#1F4B3A]">(you)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-full ${isCurrentlySpeaking ? 'bg-[#1F4B3A] animate-pulse' : 'bg-[#B6ADA6]'}`}></span>
                      {personaActive ? 'AI' : 'Human'}
                    </div>
                  </div>
                  
                  {isYou && (
                    <>
                      <MicSelector
                        value={selectedMic}
                        onValueChange={setSelectedMic}
                        muted={isMicMuted}
                        onMutedChange={setIsMicMuted}
                        disabled={aiActive}
                      />
                      <div className="flex justify-center">
                        <ScrollingWaveform active={!isMicMuted && isConnected} height={40} />
                      </div>
                    </>
                  )}
                  
                  {!isYou && entry && (
                    <div className="flex justify-center pt-2">
                      <ScrollingWaveform active={isConnected && isCurrentlySpeaking} height={40} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Transcript */}
          <Card>
            <CardHeader className="space-y-1 py-3">
              <div className="heading-font text-xl">Transcript</div>
              <p className="text-xs text-muted-foreground">Powered by Deepgram Nova-3 • Real-time streaming</p>
            </CardHeader>
            <CardContent className="space-y-3 max-h-64 overflow-y-auto">
              {transcripts.map((line) => (
                <div key={line.id} className="rounded-2xl border border-border/60 p-3 bg-white/80">
                  <div className="text-xs text-muted-foreground">
                    {nameFor(line.uid)}
                    {line.speaker_id !== undefined && line.speaker_id !== null && ` (Speaker ${line.speaker_id})`}
                    {' · '}
                    {new Date(line.created_at).toLocaleTimeString()}
                  </div>
                  <div className="text-sm mt-1">{line.text}</div>
                </div>
              ))}
              {transcripts.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Start talking! Transcripts will appear here.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Topic Suggestions */}
          <Card>
            <CardHeader className="space-y-1 py-3">
              <div className="heading-font text-xl">Topic Sparks</div>
              <p className="text-xs text-muted-foreground">Updates every 30s</p>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {suggestions.map((idea, idx) => (
                  <span key={idx} className="px-3 py-1 rounded-full bg-[#E7E2DA] text-xs">{idea}</span>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={fetchSuggestions} disabled={suggestionLoading}>
                {suggestionLoading ? 'Refreshing…' : 'Refresh now'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Moderator */}
          <Card>
            <CardHeader className="space-y-1 py-3">
              <div className="heading-font text-xl">Moderator</div>
              <p className="text-xs text-muted-foreground">ElevenLabs voice coach</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 max-h-32 overflow-y-auto text-sm">
                {moderatorMessages.map((msg) => (
                  <div key={msg.id} className="rounded-2xl border border-border/60 bg-white/80 p-3">{msg.text}</div>
                ))}
              </div>
              <div className="space-y-2">
                <Textarea 
                  placeholder="Ask the moderator anything" 
                  value={question} 
                  onChange={(e) => setQuestion(e.target.value)} 
                />
                <Button onClick={handleAskModerator} disabled={moderatorBusy}>
                  {moderatorBusy ? 'Thinking…' : 'Ask moderator'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Controls */}
          <Card>
            <CardHeader className="py-3">
              <div className="heading-font text-xl">Controls</div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {isHost && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    AI persona window ({formatSeconds(Math.min(aiCountdown, AI_MAX_SECONDS))} / {formatSeconds(AI_MAX_SECONDS)})
                  </div>
                  <div className="h-2 rounded-full bg-[#E2DBD3]">
                    <div 
                      className={`h-2 rounded-full ${aiActive ? 'bg-[#1F4B3A]' : 'bg-[#B6ADA6]'}`} 
                      style={{ width: `${Math.min(100, (aiCountdown / AI_MAX_SECONDS) * 100)}%` }} 
                    />
                  </div>
                  <Button onClick={handleActivateAI} disabled={aiActive || aiBusy || !isConnected} className="w-full">
                    {aiActive ? 'Persona live' : aiBusy ? 'Warming up…' : 'Let AI persona take over'}
                  </Button>
                </div>
              )}
              {role === 'detector' && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">One guess. Use it wisely.</div>
                  <Button variant="secondary" onClick={handleDetectorGuess} disabled={!!detectorResult} className="w-full">
                    Call it: AI is speaking
                  </Button>
                  {detectorResult && <div className="text-xs text-muted-foreground">{detectorResult}</div>}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
