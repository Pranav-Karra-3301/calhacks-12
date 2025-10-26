"use client"
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { fnAssignRoles, fnJoinRoom } from '@/lib/functions'
import { generateAvatarUrl, type AvatarOptions } from '@/lib/avatar'
import { QRCodeSVG } from 'qrcode.react'

type Participant = { uid: string; display_name: string | null; joined_at: string; role: string | null }
type RoomMeta = { id: string; code: string | null; created_by: string | null; status: string | null }
export default function RoomLobby({ params }: { params: { roomId: string } }) {
  const roomId = params.roomId
  const router = useRouter()
  const [participants, setParticipants] = useState<Participant[]>([])
  const [participantAvatars, setParticipantAvatars] = useState<Map<string, { seed: string | null; options: AvatarOptions | null }>>(new Map())
  const [room, setRoom] = useState<RoomMeta | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [isGuest, setIsGuest] = useState(false)
  const [guestDisplayName, setGuestDisplayName] = useState<string | null>(null)
  const [copyCodeState, setCopyCodeState] = useState<'idle' | 'copied'>('idle')
  const [copyLinkState, setCopyLinkState] = useState<'idle' | 'copied'>('idle')
  const [startingGame, setStartingGame] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const navigated = useRef(false)
  const joinAttempted = useRef(false)

  const guestNameFromUid = (uid: string) => `Guest ${uid.slice(0, 4).toUpperCase()}`

  const shareLink = typeof window === 'undefined' ? `https://mimic.game/r/${roomId}` : `${window.location.origin}/r/${roomId}`
  const displayCode = room?.code ?? roomId
  const seatsFilled = participants.length >= 2

  useEffect(() => {
    let active = true
    async function ensureSession() {
      try {
        const { data: auth } = await supabase.auth.getUser()
        if (!active) return
        if (auth.user) {
          setUserId(auth.user.id)
          const anonymous = Boolean(auth.user.is_anonymous)
          setIsGuest(anonymous)
          if (anonymous) setGuestDisplayName(guestNameFromUid(auth.user.id))
          return
        }

        const { data, error } = await supabase.auth.signInAnonymously()
        if (!active) return
        if (error || !data.user) {
          router.replace(`/auth/signin?redirectTo=${encodeURIComponent(`/r/${roomId}`)}`)
          return
        }
        setUserId(data.user.id)
        setIsGuest(true)
        setGuestDisplayName(guestNameFromUid(data.user.id))
      } catch (error) {
        console.error('Failed to establish session:', error)
        if (active) {
          router.replace(`/auth/signin?redirectTo=${encodeURIComponent(`/r/${roomId}`)}`)
        }
      }
    }

    ensureSession()
    return () => { active = false }
  }, [roomId, router])

  useEffect(() => {
    let mounted = true
    let pollInterval: NodeJS.Timeout | null = null
    
    async function fetchRoomData() {
      try {
        const { data: auth } = await supabase.auth.getUser()
        if (!auth.user || !mounted) return
        
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
            if (data.room) setRoom(data.room as RoomMeta)
          }
        }
      } catch (err) {
        console.error('Failed to fetch room data:', err)
      }
    }
    
    // Fetch initial data
    fetchRoomData()
    
    // Poll every 2 seconds for updates (fallback for realtime)
    pollInterval = setInterval(fetchRoomData, 2000)
    
    // Also subscribe to realtime updates (primary mechanism)
    const channel = supabase.channel(`room-${roomId}-participants`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `room_id=eq.${roomId}` }, (payload) => {
        setParticipants((prev) => {
          if (payload.eventType === 'INSERT') return [...prev, payload.new as Participant]
          if (payload.eventType === 'UPDATE') return prev.map((row) => row.uid === payload.new.uid ? (payload.new as Participant) : row)
          if (payload.eventType === 'DELETE') return prev.filter((row) => row.uid !== payload.old.uid)
          return prev
        })
      })
      .subscribe()
    
    return () => { 
      mounted = false
      if (pollInterval) clearInterval(pollInterval)
      supabase.removeChannel(channel)
    }
  }, [roomId])

  // Fetch avatars for participants
  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (participants.length === 0) return
      const uids = participants.map(p => p.uid)
      const { data } = await supabase.from('profiles').select('id, avatar_seed, avatar_options').in('id', uids)
      if (mounted && data) {
        const avatarMap = new Map<string, { seed: string | null; options: AvatarOptions | null }>()
        data.forEach((profile: any) => {
          avatarMap.set(profile.id, {
            seed: profile.avatar_seed ?? null,
            options: profile.avatar_options ?? null,
          })
        })
        setParticipantAvatars(avatarMap)
      }
    })()
    return () => { mounted = false }
  }, [participants])

  useEffect(() => {
    let mounted = true
    // Room data is fetched in the combined API call above
    // Just subscribe to realtime updates
    const channel = supabase.channel(`room-${roomId}-meta`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
        setRoom(payload.new as RoomMeta)
      })
      .subscribe()
    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [roomId])

  useEffect(() => {
    if (!userId) return
    if (isGuest && !guestDisplayName) return
    const alreadyParticipant = participants.some((p) => p.uid === userId)
    if (alreadyParticipant) {
      joinAttempted.current = true
      setJoinError(null)
      return
    }
    if (joinAttempted.current) return
    joinAttempted.current = true
    ;(async () => {
      try {
        await fnJoinRoom(roomId, isGuest ? guestDisplayName ?? undefined : undefined)
        setJoinError(null)
      } catch (error: any) {
        console.error('Failed to auto-join room:', error)
        setJoinError(error?.message || 'Unable to join room. Try refreshing the page.')
        joinAttempted.current = false
      }
    })()
  }, [userId, participants, roomId, isGuest, guestDisplayName])

  useEffect(() => {
    if (!room?.status || navigated.current) return
    if (room.status === 'talk') {
      navigated.current = true
      router.push(`/r/${roomId}/talk`)
    }
  }, [room?.status, roomId, router])

  const isHost = room?.created_by === userId

  async function handleStartGame() {
    if (!seatsFilled || startingGame) return
    setStartingGame(true)
    try {
      await fnAssignRoles(roomId)
      // Room status will change to 'talk' and auto-redirect will happen
    } catch (error) {
      console.error('Failed to start game:', error)
      setStartingGame(false)
    }
  }

  async function handleCopy(value: string, type: 'code' | 'link') {
    try {
      await navigator.clipboard.writeText(value)
      if (type === 'code') {
        setCopyCodeState('copied')
        setTimeout(() => setCopyCodeState('idle'), 1800)
      } else {
        setCopyLinkState('copied')
        setTimeout(() => setCopyLinkState('idle'), 1800)
      }
    } catch (_) {
      // ignore clipboard failures
    }
  }

  return (
    <div className="space-y-8 pb-16">
      <section className="texture-panel">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="space-y-4 flex-1">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Room ready</p>
            <h1 className="heading-font text-3xl sm:text-4xl">Share this code with your friend.</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">We&apos;ll hold here until both seats are filled. The conversation view opens automatically once someone joins.</p>
            <div className="flex flex-wrap items-center gap-4">
              <div className="heading-font text-4xl tracking-[0.2em]">{displayCode}</div>
              <Button onClick={() => handleCopy(displayCode, 'code')}>{copyCodeState === 'copied' ? 'Copied!' : 'Copy code'}</Button>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => handleCopy(shareLink, 'link')}>
                {copyLinkState === 'copied' ? 'Link copied' : 'Copy invite link'}
              </Button>
            </div>
          </div>
          <div className="w-full max-w-sm rounded-3xl border border-border/70 bg-white/80 p-4 text-center lg:max-w-xs">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground mb-2">Instant access</div>
            <div className="mx-auto flex items-center justify-center rounded-2xl border border-border/60 bg-white p-4">
              <QRCodeSVG value={shareLink} size={180} level="Q" bgColor="#ffffff" fgColor="#0F172A" />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Scan to jump in as a guest—no account needed.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="space-y-1">
            <div className="heading-font text-2xl">Participants</div>
            <p className="text-sm text-muted-foreground">{participants.length}/2 seats claimed</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {[0, 1].map((slot) => {
              const entry = participants[slot]
              const isYou = entry && entry.uid === userId
              const avatarProfile = entry ? participantAvatars.get(entry.uid) : null
              const resolvedSeed = entry ? (avatarProfile?.seed ?? entry.uid) : null
              const resolvedOptions = avatarProfile?.options ?? undefined
              return (
                <div key={slot} className="flex items-center gap-3 rounded-2xl border border-border/70 px-4 py-4 bg-white/80">
                  {entry ? (
                    <img 
                      src={generateAvatarUrl(resolvedSeed || entry.uid, resolvedOptions)} 
                      alt={entry?.display_name || 'Player avatar'} 
                      className="w-12 h-12 rounded-xl border border-border/70 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl border border-border/70 bg-muted flex-shrink-0 flex items-center justify-center text-xl">
                      {entry ? '👤' : '⏳'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      {entry ? (entry.display_name || 'Player') : 'Waiting for player'}
                      {isYou ? <span className="ml-2 text-xs text-[#1F4B3A]">you</span> : null}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {entry ? 'Joined ' + new Date(entry.joined_at).toLocaleTimeString() : 'Share the code to invite'}
                    </div>
                  </div>
                  <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground flex-shrink-0">
                    {entry?.role ? entry.role : slot === 0 ? 'HOST' : 'GUEST'}
                  </div>
                </div>
              )
            })}
            <div className="text-xs text-muted-foreground">
              {seatsFilled ? 'Both players ready!' : 'Need help? Drop your friend the full link or code above.'}
            </div>
            {joinError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {joinError}
              </div>
            )}
            {isHost && (
              <Button 
                onClick={handleStartGame} 
                disabled={!seatsFilled || startingGame}
                className="w-full mt-4"
                size="lg"
              >
                {startingGame ? 'Starting...' : seatsFilled ? 'Start Game' : 'Waiting for players...'}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <div className="heading-font text-2xl">Call prep</div>
            <p className="text-sm text-muted-foreground">What happens next</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-3 text-sm">
              <li>• Once both players are present, we assign roles automatically.</li>
              <li>• The host jumps straight into the voice call view after assignments.</li>
              <li>• Your AI persona controls live inside the call screen.</li>
            </ul>
            {!seatsFilled && (
              <div className="rounded-2xl border border-border/70 p-4 bg-gradient-to-br from-[#F3EFE8] to-[#E7E1D8] text-sm text-muted-foreground">
                Tip: Sending the invite link is easiest on mobile. We&apos;ll keep this lobby open in the background.
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
