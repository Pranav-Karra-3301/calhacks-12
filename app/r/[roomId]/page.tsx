"use client"
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { fnAssignRoles } from '@/lib/functions'
import { generateAvatarUrl } from '@/lib/avatar'

type Participant = { uid: string; display_name: string | null; joined_at: string; role: string | null }
type RoomMeta = { id: string; code: string | null; created_by: string | null; status: string | null }
type ParticipantAvatar = { uid: string; avatar_seed: string | null }

export default function RoomLobby({ params }: { params: { roomId: string } }) {
  const roomId = params.roomId
  const router = useRouter()
  const [participants, setParticipants] = useState<Participant[]>([])
  const [participantAvatars, setParticipantAvatars] = useState<Map<string, string>>(new Map())
  const [room, setRoom] = useState<RoomMeta | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [copyCodeState, setCopyCodeState] = useState<'idle' | 'copied'>('idle')
  const [copyLinkState, setCopyLinkState] = useState<'idle' | 'copied'>('idle')
  const attemptedStart = useRef(false)
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
    ;(async () => {
      const { data } = await supabase.from('participants').select('*').eq('room_id', roomId)
      if (mounted) setParticipants((data ?? []) as Participant[])
    })()
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
    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [roomId])

  // Fetch avatars for participants
  useEffect(() => {
    let mounted = true
    ;(async () => {
      if (participants.length === 0) return
      const uids = participants.map(p => p.uid)
      const { data } = await supabase.from('profiles').select('id, avatar_seed').in('id', uids)
      if (mounted && data) {
        const avatarMap = new Map<string, string>()
        data.forEach((profile: any) => {
          if (profile.avatar_seed) {
            avatarMap.set(profile.id, profile.avatar_seed)
          }
        })
        setParticipantAvatars(avatarMap)
      }
    })()
    return () => { mounted = false }
  }, [participants])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.from('rooms').select('id, code, created_by, status').eq('id', roomId).maybeSingle()
      if (mounted && data) setRoom(data as RoomMeta)
    })()
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

  useEffect(() => {
    if (!room || !userId) return
    if (room.created_by !== userId) return
    if (room.status && room.status !== 'lobby') return
    if (!seatsFilled) return
    if (attemptedStart.current) return
    attemptedStart.current = true
    fnAssignRoles(roomId).catch(() => {
      attemptedStart.current = false
    })
  }, [room, userId, seatsFilled, roomId])

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
              const avatarSeed = entry ? participantAvatars.get(entry.uid) : null
              return (
                <div key={slot} className="flex items-center gap-3 rounded-2xl border border-border/70 px-4 py-4 bg-white/80">
                  {avatarSeed ? (
                    <img 
                      src={generateAvatarUrl(avatarSeed)} 
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
                      {entry ? (entry.display_name || entry.uid.slice(0, 6)) : 'Waiting for player'}
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
              {seatsFilled ? 'Pair locked in. Auto-launching the voice room…' : 'Need help? Drop your friend the full link or code above.'}
            </div>
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
