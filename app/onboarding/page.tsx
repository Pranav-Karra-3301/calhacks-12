"use client"
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { generateRandomSeed, generateAvatarUrl } from '@/lib/avatar'

export default function OnboardingPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [avatarSeed, setAvatarSeed] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      const uid = data.user?.id
      if (!uid) { router.replace('/auth/signin'); return }
      const { data: p } = await supabase.from('profiles').select('display_name, avatar_seed').eq('id', uid).maybeSingle()
      if (!mounted) return
      if (p?.display_name) setDisplayName(p.display_name)
      if (p?.avatar_seed) setAvatarSeed(p.avatar_seed)
      else setAvatarSeed(generateRandomSeed())
    })()
    return () => { mounted = false }
  }, [router])

  function regenerateAvatar() {
    setAvatarSeed(generateRandomSeed())
  }

  async function saveAndContinue() {
    setSaving(true)
    setError(null)
    const { data } = await supabase.auth.getUser()
    const uid = data.user?.id
    if (!uid) { router.replace('/auth/signin'); return }
    const { error } = await supabase.from('profiles').upsert({ 
      id: uid, 
      display_name: displayName || null, 
      avatar_seed: avatarSeed,
      updated_at: new Date().toISOString() 
    })
    if (error) { setError(error.message); setSaving(false); return }
    router.replace('/')
  }

  return (
    <div className="centered-card">
      <Card className="w-full max-w-xl">
        <CardHeader className="text-lg font-semibold">Welcome! Set your name</CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Quick overview: Two players join a room. You both record a short
            voice sample. One is secretly the Target and can let AI speak in
            their voice anytime. The other is the Detector and gets one guess
            to call out when they think AI took over. Timing and intuition win.
          </div>
          <div>
            <div className="text-sm mb-1">Display name</div>
            <Input placeholder="Your name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>
          <div>
            <div className="text-sm mb-2">Your avatar</div>
            <div className="flex flex-col items-center space-y-3">
              {avatarSeed && (
                <img 
                  src={generateAvatarUrl(avatarSeed)} 
                  alt="Your avatar" 
                  className="w-32 h-32 rounded-2xl border-2 border-border shadow-sm"
                />
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={regenerateAvatar}
                type="button"
              >
                Regenerate Avatar
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                You can customize this later in your profile
              </p>
            </div>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <Button onClick={saveAndContinue} disabled={saving}>Continue</Button>
        </CardContent>
      </Card>
    </div>
  )
}

