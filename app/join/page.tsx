"use client"
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { fnJoinRoom } from '@/lib/functions'

export default function JoinPage() {
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function ensureUser() {
    const { data: auth } = await supabase.auth.getUser()
    if (auth.user) return auth.user
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error || !data.user) throw new Error(error?.message || 'Unable to create a guest session right now.')
    return data.user
  }

  async function join() {
    const roomId = code.trim().toUpperCase()
    if (!roomId) {
      setError('Enter a room code')
      return
    }
    setJoining(true)
    setError(null)
    try {
      const user = await ensureUser()
      const displayName = user.is_anonymous ? `Guest ${user.id.slice(0, 4).toUpperCase()}` : user.user_metadata?.name ?? null
      await fnJoinRoom(roomId, displayName)
      router.push(`/r/${roomId}`)
    } catch (err: any) {
      console.error('Failed to join via code:', err)
      setError(err?.message || 'Unable to join room. Try again.')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="centered-card">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="text-lg font-semibold">Join a Room</div>
          <p className="text-sm text-muted-foreground">No account needed—enter the host code and we&apos;ll drop you straight into the lobby.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Enter code e.g. GHOST-4829"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') join() }}
            disabled={joining}
          />
          {error && <div className="text-sm text-red-600">{error}</div>}
          <Button onClick={join} className="w-full" disabled={joining}>
            {joining ? 'Joining...' : 'JOIN'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
