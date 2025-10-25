"use client"
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogoHeader } from '@/components/home/LogoHeader'
import { CircularText } from '@/components/home/CircularText'

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signInEmail() {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setLoading(false)
    router.replace('/onboarding')
  }

  async function signInGithub() {
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/onboarding` : undefined
    await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo } })
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center">
      <LogoHeader />
      <CircularText />
      <div className="relative z-10 w-full max-w-xl px-4">
        <Card className="w-full aspect-square flex flex-col justify-center">
          <CardHeader className="text-lg font-semibold">Sign in</CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            <Input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
            {error && <div className="text-sm text-red-600">{error}</div>}
            <Button onClick={signInEmail} disabled={loading} className="w-full">Sign in</Button>
            <Button onClick={signInGithub} variant="outline" className="w-full">Continue with GitHub</Button>
            <div className="text-sm text-muted-foreground">No account? <Link className="underline" href="/auth/signup">Sign up</Link></div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
