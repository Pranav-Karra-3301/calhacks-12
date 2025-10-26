'use client'

import { useEffect, useState } from 'react'
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

export default function SoloPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [currentRound, setCurrentRound] = useState<RoundData | null>(null)
  const [sessionScore, setSessionScore] = useState({ correct: 0, total: 0 })
  const [roundNumber, setRoundNumber] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (user) {
      fetchNewRound()
    }
  }, [user])

  async function checkAuth() {
    const { data } = await supabase.auth.getUser()
    if (!data.user) {
      router.replace('/auth/signin')
      return
    }
    setUser(data.user)
    setLoading(false)
  }

  async function fetchNewRound() {
    try {
      const response = await fetch('/api/singleplayer/get-round')
      if (!response.ok) throw new Error('Failed to fetch round')
      const data = await response.json()
      setCurrentRound(data)
    } catch (error) {
      console.error('Error fetching round:', error)
    }
  }

  async function handleSwipe(direction: 'left' | 'right') {
    if (!currentRound || !user || submitting) return

    setSubmitting(true)
    const guessedAi = direction === 'right'

    try {
      // Submit guess
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const response = await fetch('/api/singleplayer/submit-guess', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
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

      // Update session score
      setSessionScore(prev => ({
        correct: prev.correct + (correct ? 1 : 0),
        total: prev.total + 1,
      }))

      // Load next round
      setRoundNumber(prev => prev + 1)
      await fetchNewRound()
    } catch (error) {
      console.error('Error submitting guess:', error)
    } finally {
      setSubmitting(false)
    }
  }

  function handleQuit() {
    // Navigate to stats with session data
    const url = `/solo/stats?sessionCorrect=${sessionScore.correct}&sessionTotal=${sessionScore.total}`
    router.push(url as any)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <LogoHeader />
      
      {/* Header with quit button and score */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            Session: {sessionScore.correct}/{sessionScore.total}
          </div>
          <Button variant="outline" onClick={handleQuit}>
            Quit & View Stats
          </Button>
        </div>
      </div>

      {/* Main game area */}
      <div className="flex-1 flex items-center justify-center py-12">
        {currentRound ? (
          <SwipeCard
            audioUrl={currentRound.audioUrl}
            text={currentRound.text}
            onSwipe={handleSwipe}
            roundNumber={roundNumber}
            disabled={submitting}
          />
        ) : (
          <div className="text-center space-y-4">
            <div className="text-lg">Loading next round...</div>
          </div>
        )}
      </div>
    </div>
  )
}

