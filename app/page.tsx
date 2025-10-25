"use client"
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

export default function HomePage() {
  const [user, setUser] = useState<any>(null)
  useEffect(() => {
    let mounted = true
    async function init() {
      const { data } = await supabase.auth.getUser()
      const u = data.user
      if (!mounted) return
      setUser(u)
      // If signed in, ensure they have a display_name else send to onboarding
      if (u) {
        const { data: p } = await supabase.from('profiles').select('display_name').eq('id', u.id).maybeSingle()
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
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null))
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [])
  return (
    <div className="relative min-h-screen flex items-center justify-center">
      <div className="absolute top-8 left-8 flex items-center gap-3 z-20">
        <Image src="/logo.svg" alt="Mimicry Logo" width={96} height={96} />
        <span className="text-3xl font-heading">mimicry</span>
      </div>

      {/* Circular rotating text for desktop, scrolling marquee for mobile */}
      <style jsx>{`
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-rotate {
          animation: rotate 40s linear infinite;
        }
        .animate-scroll {
          animation: scroll 30s linear infinite;
        }
      `}</style>

      {/* Desktop: Circular text - behind card */}
      <div className="hidden md:flex absolute inset-0 items-center justify-center pointer-events-none z-0">
        <div className="relative animate-rotate w-[120vmin] h-[120vmin] max-w-[1000px] max-h-[1000px]">
          <svg viewBox="0 0 1000 1000" className="w-full h-full">
            <defs>
              <path
                id="circlePath"
                d="M 500, 500 m -450, 0 a 450,450 0 1,1 900,0 a 450,450 0 1,1 -900,0"
              />
            </defs>
            <text className="fill-current text-[#71717a] font-heading" style={{ fontSize: '30px', letterSpacing: '0.05em' }}>
              <textPath href="#circlePath" startOffset="0%">
                Can you tell who's real? – A social deception game for the age of AI. – The world's first social Turing test. – Can you tell who's real? – A social deception game for the age of AI. – The world's first social Turing test. –
              </textPath>
            </text>
          </svg>
        </div>
      </div>

      {/* Mobile: Scrolling marquee - behind card */}
      <div className="md:hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full overflow-hidden pointer-events-none z-0">
        <div className="relative w-full">
          <div className="flex animate-scroll whitespace-nowrap">
            <span className="inline-block px-8 text-lg text-muted-foreground font-heading">Can you tell who's real?</span>
            <span className="inline-block px-8 text-lg text-muted-foreground font-heading">A social deception game for the age of AI</span>
            <span className="inline-block px-8 text-lg text-muted-foreground font-heading">The world's first social Turing test</span>
            <span className="inline-block px-8 text-lg text-muted-foreground font-heading">Can you tell who's real?</span>
            <span className="inline-block px-8 text-lg text-muted-foreground font-heading">A social deception game for the age of AI</span>
            <span className="inline-block px-8 text-lg text-muted-foreground font-heading">The world's first social Turing test</span>
          </div>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-xl px-4">
      <Card className="w-full aspect-square flex flex-col justify-center">
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
    </div>
  )
}
