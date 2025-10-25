"use client"
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { fnAssignRoles } from '@/lib/functions'

export default function RoomLobby({ params }: { params: { roomId: string } }) {
  const roomId = params.roomId
  const [participants, setParticipants] = useState<any[]>([])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.from('participants').select('*').eq('room_id', roomId)
      if (mounted) setParticipants(data || [])
    })()
    const channel = supabase.channel(`room-${roomId}-participants`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `room_id=eq.${roomId}` }, (payload) => {
        setParticipants((prev) => {
          const rows = [...prev]
          if (payload.eventType === 'INSERT') rows.push(payload.new)
          if (payload.eventType === 'UPDATE') return rows.map(r => r.uid === payload.new.uid ? payload.new : r)
          if (payload.eventType === 'DELETE') return rows.filter(r => r.uid !== payload.old.uid)
          return rows
        })
      })
      .subscribe()
    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [roomId])

  async function startGame() {
    await fnAssignRoles(roomId)
  }
  return (
    <div className="centered-card">
      <Card className="w-full max-w-2xl">
        <CardHeader className="space-y-1">
          <div className="text-xl font-semibold">Room: {roomId}</div>
          <div className="text-sm text-muted-foreground">mimic.game/r/{roomId}</div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="text-sm text-muted-foreground mb-2">Players ({participants.length}/2):</div>
            <div className="flex flex-col gap-1">
              {participants.map(p => (<div key={p.uid}>🟢 {p.display_name || p.uid}</div>))}
            </div>
          </div>
          <div className="flex gap-3">
            <Link href={`/r/${roomId}/setup`}><Button onClick={startGame}>START GAME</Button></Link>
            <Button variant="outline">COPY LINK</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
