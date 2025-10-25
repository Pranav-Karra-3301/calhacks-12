'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { generateAvatarUrl } from '@/lib/avatar'

export function GameCard() {
  const [user, setUser] = useState<any>(null)
  const [avatarSeed, setAvatarSeed] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function init() {
      const { data } = await supabase.auth.getUser()
      const u = data.user
      if (!mounted) return
      setUser(u)
      // If signed in, ensure they have a display_name else send to onboarding
      if (u) {
        const { data: p } = await supabase.from('profiles').select('display_name, avatar_seed').eq('id', u.id).maybeSingle()
        if (!mounted) return
        if (p?.avatar_seed) setAvatarSeed(p.avatar_seed)
        if (!p?.display_name) {
          // Do not redirect if already on onboarding
          if (typeof window !== 'undefined' && window.location.pathname !== '/onboarding') {
            window.location.href = '/onboarding'
            return
          }
        }
      }
    }
    init()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null)
      if (!s?.user) setAvatarSeed(null)
    })
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [])

  return (
    <div className="relative z-10 w-full max-w-xl px-4">
      <Card className="w-full aspect-square flex flex-col justify-center">
        <CardHeader>
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">🎭 THE MIMIC GAME</h1>
            <p className="text-muted-foreground">1v1 AI Detection Challenge</p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 justify-center w-full">
          <Link href="/r/new" className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto justify-center text-base font-semibold tracking-wider">
              CREATE ROOM
            </Button>
          </Link>
          <Link href="/join" className="w-full sm:w-auto">
            <Button size="lg" variant="secondary" className="w-full sm:w-auto justify-center text-base font-semibold tracking-wider">
              JOIN ROOM
            </Button>
          </Link>
        </CardContent>
        <CardContent className="flex flex-col gap-3 items-center">
          {user ? (
            <>
              {avatarSeed && (
                <img 
                  src={generateAvatarUrl(avatarSeed)} 
                  alt="Your avatar" 
                  className="w-16 h-16 rounded-xl border-2 border-border"
                />
              )}
              <div className="text-sm">Signed in as {user.email}</div>
              <div className="flex gap-2">
                <Link href="/profile"><Button variant="outline">Profile</Button></Link>
                <Button variant="ghost" onClick={() => supabase.auth.signOut()}>Sign out</Button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <Link href="/auth/signin"><Button variant="outline">Sign in</Button></Link>
              <Link href="/auth/signup"><Button variant="outline">Sign up</Button></Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
