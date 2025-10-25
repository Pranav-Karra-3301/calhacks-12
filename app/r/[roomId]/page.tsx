"use client"
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { fnAssignRoles } from '@/lib/functions'

type Participant = { uid: string; display_name: string | null; joined_at: string; role: string | null }
type RoomMeta = { id: string; code: string | null; created_by: string | null; status: string | null }

export default function RoomLobby({ params }: { params: { roomId: string } }) {
  const roomId = params.roomId
  const router = useRouter()
  const [participants, setParticipants] = useState<Participant[]>([])
  const [room, setRoom] = useState<RoomMeta | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [copyCodeState, setCopyCodeState] = useState<'idle' | 'copied'>('idle')
  const [copyLinkState, setCopyLinkState] = useState<'idle' | 'copied'>('idle')
  const [startingGame, setStartingGame] = useState(false)
  const navigated = useRef(false)

  const shareLink = typeof window === 'undefined' ? `https://mimic.game/r/${roomId}` : `${window.location.origin}/r/${roomId}`
  const displayCode = room?.code ?? roomId
  const seatsFilled = participants.length >= 2

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!active) return
      if (!auth.user) {
        router.replace(`/auth/signin?redirectTo=${encodeURIComponent(`/r/${roomId}`)}`)
        return
      }
      setUserId(auth.user.id)
    })()
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
      <section className="texture-panel space-y-4">
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
              return (
                <div key={slot} className="flex items-center justify-between rounded-2xl border border-border/70 px-4 py-4 bg-white/80">
                  <div>
                    <div className="text-sm font-medium">
                      {entry ? (entry.display_name || 'Player') : 'Waiting for player'}
                      {isYou ? <span className="ml-2 text-xs text-[#1F4B3A]">you</span> : null}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {entry ? 'Joined ' + new Date(entry.joined_at).toLocaleTimeString() : 'Share the code to invite'}
                    </div>
                  </div>
                  <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                    {entry?.role ? entry.role : slot === 0 ? 'HOST' : 'GUEST'}
                  </div>
                </div>
              )
            })}
            <div className="text-xs text-muted-foreground">
              {seatsFilled ? 'Both players ready!' : 'Need help? Drop your friend the full link or code above.'}
            </div>
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
