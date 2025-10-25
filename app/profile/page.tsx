"use client"
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Profile = {
  id: string
  display_name: string | null
  elevenlabs_voice_id: string | null
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) { setLoading(false); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
      if (data) setProfile(data as any)
      setLoading(false)
    })()
  }, [])

  async function save() {
    setMessage(null)
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) return
    const upsert = {
      id: uid,
      display_name: profile?.display_name ?? null,
      elevenlabs_voice_id: profile?.elevenlabs_voice_id ?? null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('profiles').upsert(upsert)
    if (error) setMessage(error.message)
    else setMessage('Saved')
  }

  if (loading) return <div className="centered-card">Loading...</div>
  if (!profile) return <div className="centered-card">Sign in to view your profile.</div>

  return (
    <div className="centered-card">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-lg font-semibold">Your Profile</CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Display name</div>
            <Input value={profile.display_name ?? ''} onChange={e => setProfile({ ...(profile as any), display_name: e.target.value })} />
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">ElevenLabs Voice ID</div>
            <Input placeholder="elevenlabs voice id" value={profile.elevenlabs_voice_id ?? ''} onChange={e => setProfile({ ...(profile as any), elevenlabs_voice_id: e.target.value })} />
          </div>
          {message && <div className="text-sm">{message}</div>}
          <Button onClick={save}>Save</Button>
        </CardContent>
      </Card>
    </div>
  )
}

