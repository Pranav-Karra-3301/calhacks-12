"use client"
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function HomePage() {
  const [user, setUser] = useState<any>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null))
    return () => { sub.subscription.unsubscribe() }
  }, [])
  return (
    <div className="centered-card">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">🎭 THE MIMIC GAME</h1>
            <p className="text-muted-foreground">1v1 AI Detection Challenge</p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/r/new"><Button size="lg">CREATE ROOM</Button></Link>
          <Link href="/join"><Button size="lg" variant="secondary">JOIN ROOM</Button></Link>
        </CardContent>
        <CardContent className="flex flex-col gap-2 items-center">
          {user ? (
            <>
              <div className="text-sm">Signed in as {user.email}</div>
              <div className="flex gap-2"><Link href="/profile"><Button variant="outline">Profile</Button></Link><Button variant="ghost" onClick={() => supabase.auth.signOut()}>Sign out</Button></div>
            </>
          ) : (
            <div className="flex gap-2"><Link href="/auth/signin"><Button variant="outline">Sign in</Button></Link><Link href="/auth/signup"><Button variant="outline">Sign up</Button></Link></div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
