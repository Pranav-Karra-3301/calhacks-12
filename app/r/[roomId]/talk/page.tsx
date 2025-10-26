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
import { fnActivateAI, fnDetectorGuess, fnEndCall } from '@/lib/functions'
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
  result?: string | null
}

type Participant = { uid: string; display_name: string | null; joined_at: string }
type TranscriptLine = { id: number; text: string; uid: string | null; created_at: string; speaker_id?: number | null }
type AiClip = { text: string; audioBlob: Blob }

export default function TalkPage({ params }: { params: { roomId: string } }) {
  const roomId = params.roomId
  const router = useRouter()
  
  // Auth & room state
  const [userId, setUserId] = useState<string | null>(null)
  const [room, setRoom] = useState<RoomInfo | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const participantsRef = useRef<Participant[]>([])
  
  // LiveKit state
  const livekitRoom = useRef<Room | null>(null)
  const roomEndRequestedRef = useRef(false)
  const [isConnected, setIsConnected] = useState(false)
  const [remoteParticipants, setRemoteParticipants] = useState<string[]>([])
  const [isSpeaking, setIsSpeaking] = useState<Record<string, boolean>>({})
  const [audioLevels, setAudioLevels] = useState<Record<string, number>>({})
  const [participantMuteMap, setParticipantMuteMap] = useState<Record<string, boolean>>({})
  
  // Transcript state
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([])
  const transcriptsRef = useRef<string[]>([])
  
  // Moderator state
  const [question, setQuestion] = useState('')
  const [moderatorMessages, setModeratorMessages] = useState<{ id: string; text: string }[]>([])
  const [moderatorBusy, setModeratorBusy] = useState(false)
  const [introPlayed, setIntroPlayed] = useState(false)
  const introInProgress = useRef(false)
  
  // Timer state
  const [timerStart, setTimerStart] = useState(0)
  
  // AI persona state
  const [aiCountdown, setAiCountdown] = useState(0)
  const [aiFinished, setAiFinished] = useState(false)
  const aiAnnounced = useRef(false)
  const [aiBusy, setAiBusy] = useState(false)
  const aiLoopInterval = useRef<NodeJS.Timeout | null>(null)
  const aiClipWarmRef = useRef<Promise<AiClip> | null>(null)
  const aiActiveRef = useRef(false)
  
  // Detector state
  const [detectorResult, setDetectorResult] = useState<string | null>(null)
  
  // Topic suggestions
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [suggestionLoading, setSuggestionLoading] = useState(false)
  
  // Deepgram transcription
  const deepgramRef = useRef<DeepgramLiveTranscriber | null>(null)
  
  // Mic controls
  const [selectedMic, setSelectedMic] = useState('')
  const [isMicMuted, setIsMicMuted] = useState(true)
  
  const updateParticipantMute = useCallback((uid: string | null | undefined, muted: boolean) => {
    if (!uid) return
    setParticipantMuteMap((prev) => {
      if (prev[uid] === muted) return prev
      return { ...prev, [uid]: muted }
    })
  }, [])
  
  const requestRoomEnd = useCallback(async (reason: string, leaver?: string | null, redirect = false) => {
    if (roomEndRequestedRef.current) {
      if (redirect) router.push('/')
      return
    }
    roomEndRequestedRef.current = true
    try {
      await fnEndCall(roomId, { reason, leaverUid: leaver ?? null })
    } catch (error) {
      console.error('Failed to end room:', error)
      roomEndRequestedRef.current = false
    } finally {
      if (redirect) {
        router.push('/')
      }
    }
  }, [roomId, router])
  
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
  
  // Keep refs/maps in sync with participant list
  useEffect(() => {
    participantsRef.current = participants
    setParticipantMuteMap((prev) => {
      const next = { ...prev }
      participants.forEach(({ uid }) => {
        if (!(uid in next)) {
          next[uid] = true
        }
      })
      return next
    })
  }, [participants])

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
    transcriptsRef.current = transcripts.slice(-20).map((line) => line.text)
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
  useEffect(() => {
    aiActiveRef.current = aiActive
    if (!aiActive) {
      stopAILoop()
    }
  }, [aiActive])

  useEffect(() => {
    if (room?.status === 'ended' && livekitRoom.current) {
      livekitRoom.current.disconnect()
      livekitRoom.current = null
      setIsConnected(false)
      stopAILoop()
    }
  }, [room?.status])

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
          
          // Start everyone muted until moderator intro completes
          await lkRoom.localParticipant.setMicrophoneEnabled(false)
          updateParticipantMute(userId, true)
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
      if (participant.identity && participant.identity !== userId) {
        requestRoomEnd('peer-left', participant.identity)
      }
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
    lkRoom.on(RoomEvent.TrackMuted, (_publication, participant) => {
      updateParticipantMute(participant?.identity, true)
    })

    lkRoom.on(RoomEvent.TrackUnmuted, (_publication, participant) => {
      updateParticipantMute(participant?.identity, false)
    })

    lkRoom.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const speakingMap: Record<string, boolean> = {}
      speakers.forEach((speaker) => {
        speakingMap[speaker.identity] = true
      })
      setIsSpeaking(speakingMap)
      setAudioLevels((prev) => {
        const next: Record<string, number> = {}
        const ids = new Set<string>([
          ...Object.keys(prev),
          ...participantsRef.current.map((p) => p.uid),
        ])
        if (userId) ids.add(userId)
        ids.forEach((id) => {
          next[id] = Math.max(0, (prev[id] ?? 0) * 0.35)
        })
        speakers.forEach((speaker) => {
          const level = typeof speaker.audioLevel === 'number' ? speaker.audioLevel : 0.9
          next[speaker.identity] = Math.max(next[speaker.identity] ?? 0, level)
        })
        return next
      })
    })

    connect()

    return () => {
      mounted = false
      lkRoom.disconnect()
      livekitRoom.current = null
      setIsConnected(false)
    }
  }, [userId, roomId, updateParticipantMute, requestRoomEnd])

  // Handle mute/unmute
  useEffect(() => {
    if (!livekitRoom.current || !isConnected) return
    setLocalAudioEnabled(livekitRoom.current, !isMicMuted)
  }, [isMicMuted, isConnected])
  
  useEffect(() => {
    if (!userId) return
    updateParticipantMute(userId, isMicMuted)
  }, [isMicMuted, userId, updateParticipantMute])

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
              const basePayload = {
                room_id: roomId,
                uid: userId,
                text: data.transcript,
                // Add timing data from first and last word
                start_ms: data.words && data.words.length > 0
                  ? Math.floor(data.words[0].start * 1000)
                  : null,
                end_ms: data.words && data.words.length > 0
                  ? Math.floor(data.words[data.words.length - 1].end * 1000)
                  : null,
              } as const

              const payloadWithSpeaker = {
                ...basePayload,
                speaker_id: typeof data.speaker === 'number' ? data.speaker : null,
              }

              let { error } = await supabase
                .from('transcripts')
                .insert(payloadWithSpeaker)

              // Some environments may not have the speaker_id column yet.
              if (error && (error.code === '42703' || /speaker_id/i.test(error.message || ''))) {
                console.warn('[Deepgram] speaker_id column missing, retrying without diarization column')
                const { error: fallbackError } = await supabase
                  .from('transcripts')
                  .insert(basePayload)
                error = fallbackError
              }

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
    if (participants.length < 2) return
    if (introInProgress.current) return
    playModeratorIntro()
  }, [room, introPlayed, isConnected, participants.length])

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

  async function handleEndCall() {
    if (livekitRoom.current) {
      livekitRoom.current.disconnect()
      livekitRoom.current = null
    }
    await requestRoomEnd('self-ended', userId, true)
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
        const playbackSeconds = await publishAudioBlob(livekitRoom.current, blob, 'moderator')
        const waitMs = Number.isFinite(playbackSeconds)
          ? Math.max(250, Math.ceil(playbackSeconds * 1000) + 250)
          : 1000
        await new Promise((resolve) => setTimeout(resolve, waitMs))
      } else {
        // Fallback: play locally if LiveKit isn't ready yet
        await new Promise<void>((resolve, reject) => {
          const url = URL.createObjectURL(blob)
          const audio = new Audio(url)
          const cleanup = () => {
            audio.removeEventListener('ended', handleEnded)
            audio.removeEventListener('error', handleError)
            URL.revokeObjectURL(url)
          }
          const handleEnded = () => {
            cleanup()
            resolve()
          }
          const handleError = (event: Event) => {
            console.error('Moderator audio playback failed:', event)
            cleanup()
            reject(event)
          }
          audio.addEventListener('ended', handleEnded, { once: true })
          audio.addEventListener('error', handleError, { once: true })
          audio.play().catch((error) => {
            cleanup()
            reject(error)
          })
        })
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
    introInProgress.current = true
    try {
      const hostName = nameFor(room.target_uid ?? room.created_by)
      const detectorName = room.detector_uid ? nameFor(room.detector_uid) : 'the detector'
      const lines = [
        `Hey ${hostName} and ${detectorName}! Welcome to Mimicry—the game where the host can swap themself out for a voice-cloned imposter mid-call and the detector has to report it before the timer burns out. Chat naturally, but remember someone is going to flip that switch.`,
        `You'll hear from me if you need hints or rules. Alright, I'm unmuting you both now—if you need inspiration, peek at the suggested topics on the right. Have fun!`,
      ]
      for (const line of lines) {
        const ok = await playModeratorLine(line)
        if (!ok) {
          if (!manual) {
            setModeratorMessages((prev) => [...prev, { id: crypto.randomUUID(), text: 'Tap the Replay Intro button so I can give the rundown.' }])
          }
          return
        }
      }
      setIntroPlayed(true)
      setIsMicMuted(false)
    } finally {
      introInProgress.current = false
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

  async function fetchAiPersonaClip(): Promise<AiClip> {
    const token = await getAccessToken()
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
      throw new Error('AI persona generation failed')
    }

    const { text, voiceId } = await resp.json()
    if (!text) {
      throw new Error('Empty AI response')
    }

    const ttsResp = await fetch('/api/elevenlabs/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voiceId, text, modelId: 'eleven_turbo_v2_5' }),
    })

    if (!ttsResp.ok) {
      throw new Error('TTS failed')
    }

    const audioBlob = await ttsResp.blob()
    return { text, audioBlob }
  }

  function warmAiPersonaClip() {
    if (!aiClipWarmRef.current) {
      aiClipWarmRef.current = fetchAiPersonaClip().catch((error) => {
        console.error('AI persona warmup failed:', error)
        aiClipWarmRef.current = null
        throw error
      })
    }
    return aiClipWarmRef.current
  }

  async function playAiTurn() {
    if (!livekitRoom.current || !isConnected || !aiActiveRef.current) return

    try {
      const clipPromise = aiClipWarmRef.current ?? warmAiPersonaClip()
      const clip = await clipPromise
      aiClipWarmRef.current = null

      const playbackDuration = await publishAudioBlob(livekitRoom.current, clip.audioBlob, 'ai-persona')

      if (userId) {
        await supabase.from('transcripts').insert({
          room_id: roomId,
          uid: userId,
          text: clip.text,
          created_at: new Date().toISOString(),
        })
      }

      if (aiActiveRef.current) {
        warmAiPersonaClip()
        aiLoopInterval.current = setTimeout(() => {
          playAiTurn()
        }, Math.max(900, playbackDuration * 1000 * 0.35))
      }
    } catch (error) {
      console.error('AI generation error:', error)
      aiClipWarmRef.current = null
      if (aiActiveRef.current) {
        aiLoopInterval.current = setTimeout(() => {
          warmAiPersonaClip()
          playAiTurn()
        }, 1500)
      }
    }
  }

  function startAILoop() {
    if (aiLoopInterval.current) return
    warmAiPersonaClip()
    playAiTurn()
  }

  function stopAILoop() {
    if (aiLoopInterval.current) {
      clearTimeout(aiLoopInterval.current)
      aiLoopInterval.current = null
    }
    aiClipWarmRef.current = null
  }

  async function handleActivateAI() {
    if (!livekitRoom.current || !isConnected) return
    
    setAiBusy(true)
    try {
      await fnActivateAI(roomId)
      aiActiveRef.current = true
      
      // Mute local microphone
      await setLocalAudioEnabled(livekitRoom.current, false)
      setIsMicMuted(true)
      
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

  if (room.status === 'ended') {
    const summary =
      room.result === 'detector_win'
        ? 'Detector called it in time. Game over!'
        : room.result === 'target_win'
        ? 'Target survived this round. Detector either bailed or guessed wrong.'
        : 'Call ended early. Feel free to start a new round.'
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="heading-font text-3xl">Call ended</div>
        <p className="text-muted-foreground max-w-md">{summary}</p>
        <Button onClick={() => router.push('/')}>Return home</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col p-4 gap-4">
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {isConnected ? 'Connected' : 'Connecting...'}
        </div>
        <div className="text-sm text-muted-foreground">Elapsed • <Timer start={timerStart} /></div>
        <Button variant="outline" size="sm" onClick={handleEndCall}>
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
              const isCurrentlySpeaking = !!(entry && isSpeaking[entry.uid])
              const isYou = entry?.uid === userId
              const participantMuted = entry
                ? (entry.uid === userId ? isMicMuted : participantMuteMap[entry.uid] ?? true)
                : true
              const waveLevel = entry ? audioLevels[entry.uid] ?? 0 : 0
              const yourLevel = userId ? audioLevels[userId] ?? 0 : 0
              
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
                    <div className="text-xs text-muted-foreground flex flex-col gap-1 items-end">
                      <div className="flex items-center gap-1">
                        <span className={`h-2 w-2 rounded-full ${isCurrentlySpeaking ? 'bg-[#1F4B3A] animate-pulse' : 'bg-[#B6ADA6]'}`}></span>
                        {personaActive ? 'AI' : 'Human'}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`h-2 w-2 rounded-full ${participantMuted ? 'bg-[#B92B27]' : 'bg-[#1F4B3A]'}`}></span>
                        {participantMuted ? 'Muted' : 'Live'}
                      </div>
                    </div>
                  </div>
                  
                  {isYou && (
                    <>
                      <MicSelector
                        value={selectedMic}
                        onValueChange={setSelectedMic}
                        muted={isMicMuted}
                        onMutedChange={setIsMicMuted}
                        disabled={aiActive || !introPlayed}
                      />
                      <div className="flex justify-center">
                        <ScrollingWaveform
                          active={!isMicMuted && isConnected}
                          height={40}
                          level={yourLevel}
                        />
                      </div>
                    </>
                  )}
                  
                  {!isYou && entry && (
                    <div className="flex justify-center pt-2">
                      <ScrollingWaveform
                        active={isConnected && !participantMuted}
                        height={40}
                        level={waveLevel}
                      />
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
