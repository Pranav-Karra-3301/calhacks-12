'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { SwipeCard } from '@/components/singleplayer/SwipeCard'
import { Button } from '@/components/ui/button'
import { LogoHeader } from '@/components/home/LogoHeader'

interface RoundData {
  roundId: string
  audioUrl: string | null
  text?: string
  isAi: boolean
  transcriptLength: number
  sampleId: string
}

type HistoryEntry = {
  id: string
  round: number
  guess: 'AI' | 'Human'
  actual: 'AI' | 'Human'
  correct: boolean
}

export default function SoloPage() {
  const router = useRouter()
  const [authLoading, setAuthLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [currentRound, setCurrentRound] = useState<RoundData | null>(null)
  const [nextRound, setNextRound] = useState<RoundData | null>(null)
  const [roundLoading, setRoundLoading] = useState(true)
  const [roundError, setRoundError] = useState<string | null>(null)
  const [prefetching, setPrefetching] = useState(false)
  const [sessionScore, setSessionScore] = useState({ correct: 0, total: 0 })
  const [roundNumber, setRoundNumber] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [sessionHistory, setSessionHistory] = useState<HistoryEntry[]>([])
  const [feedMix, setFeedMix] = useState({ ai: 0, human: 0 })
  const servedRoundsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        router.replace('/auth/signin')
        setAuthLoading(false)
        return
      }
      setUser(data.user)
      setAuthLoading(false)
    })()
  }, [router])

  useEffect(() => {
    if (!user) return
    let cancelled = false

    const hydrate = async () => {
      setRoundLoading(true)
      try {
        const first = await fetchRound()
        if (cancelled) return
        setCurrentRound(first)
        const second = await fetchRound()
        if (cancelled) return
        setNextRound(second)
      } finally {
        if (!cancelled) setRoundLoading(false)
      }
    }

    hydrate()
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    if (!currentRound) return
    if (servedRoundsRef.current.has(currentRound.roundId)) return
    servedRoundsRef.current.add(currentRound.roundId)
    setFeedMix((prev) => ({
      ai: prev.ai + (currentRound.isAi ? 1 : 0),
      human: prev.human + (currentRound.isAi ? 0 : 1),
    }))
  }, [currentRound])

  async function fetchRound(): Promise<RoundData | null> {
    try {
      const response = await fetch('/api/singleplayer/get-round', { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to fetch round')
      const data = await response.json()
      setRoundError(null)
      return data
    } catch (error) {
      console.error('Error fetching round:', error)
      setRoundError('Unable to load new clips right now. Please retry in a moment.')
      return null
    }
  }

  async function reloadRounds() {
    setRoundError(null)
    setRoundLoading(true)
    try {
      const first = await fetchRound()
      setCurrentRound(first)
      const second = await fetchRound()
      setNextRound(second)
    } finally {
      setRoundLoading(false)
    }
  }

  async function advanceRound() {
    let upcomingCurrent: RoundData | null = nextRound
    if (!upcomingCurrent) {
      upcomingCurrent = await fetchRound()
    }
    setCurrentRound(upcomingCurrent)
    setNextRound(null)
    setPrefetching(true)
    try {
      const future = await fetchRound()
      setNextRound(future)
    } finally {
      setPrefetching(false)
    }
  }

  async function handleSwipe(direction: 'left' | 'right') {
    if (!currentRound || !user || submitting) return

    setSubmitting(true)
    const guessedAi = direction === 'right'
    const roundIndex = roundNumber

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) throw new Error('Missing auth token')
      const response = await fetch('/api/singleplayer/submit-guess', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          roundId: currentRound.roundId,
          guessedAi,
          actualIsAi: currentRound.isAi,
          audioFile: currentRound.sampleId,
        }),
      })

      if (!response.ok) throw new Error('Failed to submit guess')

      const { correct } = await response.json()

      setSessionScore((prev) => ({
        correct: prev.correct + (correct ? 1 : 0),
        total: prev.total + 1,
      }))

      setSessionHistory((prev) => {
        const entry: HistoryEntry = {
          id: currentRound.roundId,
          round: roundIndex,
          guess: guessedAi ? 'AI' : 'Human',
          actual: currentRound.isAi ? 'AI' : 'Human',
          correct,
        }
        const nextHistory = [entry, ...prev]
        return nextHistory.slice(0, 30) // Keep more history for dots
      })

      setRoundNumber((prev) => prev + 1)
      await advanceRound()
    } catch (error) {
      console.error('Error submitting guess:', error)
      setRoundError('We could not record that guess. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleQuit() {
    const url = `/solo/stats?sessionCorrect=${sessionScore.correct}&sessionTotal=${sessionScore.total}`
    router.push(url as any)
  }

  const sessionAccuracy =
    sessionScore.total > 0 ? Math.round((sessionScore.correct / sessionScore.total) * 100) : 0

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F5F3]">
        <div className="text-lg text-[#35302E]">Loading session...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F5F3]">
      <LogoHeader />

      {/* Top bar card - matching old design */}
      <div className="w-full px-2 sm:px-4 py-4 sm:py-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-3 sm:gap-4 rounded-2xl sm:rounded-3xl border border-slate-200 bg-white/80 p-3 sm:p-5 shadow-lg shadow-slate-200/60 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <p className="text-[10px] sm:text-xs uppercase tracking-[0.3em] text-muted-foreground">Session accuracy</p>
              <p className="text-2xl sm:text-3xl font-semibold">
                {sessionScore.total ? `${sessionAccuracy}%` : '—'}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Correct guesses: {sessionScore.correct}/{sessionScore.total}
              </p>
            </div>

            {/* Progress dots */}
            <div className="hidden sm:flex gap-1.5 items-center">
              {sessionHistory.slice(0, 20).reverse().map((entry) => (
                <div
                  key={entry.id}
                  className={`h-2.5 w-2.5 rounded-full transition-all ${
                    entry.correct
                      ? 'bg-emerald-500'
                      : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>

            <Button variant="outline" onClick={handleQuit} className="w-full sm:w-auto">
              End Session
            </Button>
          </div>
        </div>
      </div>

      {/* Main content area - centered card */}
      <div className="flex-1 relative overflow-hidden">
        {roundError ? (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div className="text-center space-y-4">
              <p className="text-[#35302E] font-medium">{roundError}</p>
              <Button variant="outline" onClick={reloadRounds} disabled={roundLoading}>
                Retry
              </Button>
            </div>
          </div>
        ) : roundLoading || !currentRound ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-[#35302E]/60 text-lg">Loading...</div>
          </div>
        ) : (
          <SwipeCard
            audioUrl={currentRound.audioUrl}
            text={currentRound.text}
            onSwipe={handleSwipe}
            roundNumber={roundNumber}
            disabled={submitting}
          />
        )}
      </div>

      {/* Mobile bottom progress dots */}
      <div className="sm:hidden w-full px-4 py-3 border-t border-[#35302E]/10">
        <div className="flex items-center justify-center gap-1.5">
          {sessionHistory.slice(0, 15).reverse().map((entry) => (
            <div
              key={entry.id}
              className={`h-2 w-2 rounded-full ${
                entry.correct ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}