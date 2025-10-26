'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { LogoHeader } from '@/components/home/LogoHeader'

interface Stats {
  totalRounds: number
  correctGuesses: number
  accuracy: number
  aiDetectionRate: number
  humanDetectionRate: number
  aiRoundsPlayed: number
  humanRoundsPlayed: number
}

function StatsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [sessionStats, setSessionStats] = useState<{ correct: number; total: number } | null>(null)

  useEffect(() => {
    // Get session stats from URL params
    const sessionCorrect = searchParams.get('sessionCorrect')
    const sessionTotal = searchParams.get('sessionTotal')

    if (sessionCorrect && sessionTotal) {
      setSessionStats({
        correct: parseInt(sessionCorrect),
        total: parseInt(sessionTotal),
      })
    }

    fetchStats()
  }, [searchParams])

  async function fetchStats() {
    try {
      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        router.replace('/auth/signin')
        return
      }

      const token = (await supabase.auth.getSession()).data.session?.access_token
      const response = await fetch('/api/singleplayer/stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) throw new Error('Failed to fetch stats')

      const data2 = await response.json()
      setStats(data2)
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading stats...</div>
      </div>
    )
  }

  const sessionAccuracy = sessionStats && sessionStats.total > 0
    ? Math.round((sessionStats.correct / sessionStats.total) * 100)
    : 0

  return (
    <div className="min-h-screen bg-[#F7F5F3]">
      <LogoHeader />

      <div className="container mx-auto px-4 pt-24 sm:pt-28 md:pt-32 pb-12 max-w-4xl">
        <div className="space-y-6 sm:space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl sm:text-4xl font-bold">Your Stats</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Track your AI detection skills</p>
          </div>

          {/* Session Stats (if available) */}
          {sessionStats && sessionStats.total > 0 && (
            <Card className="border-2 border-primary">
              <CardHeader>
                <h2 className="text-xl sm:text-2xl font-semibold text-center">Last Session</h2>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 sm:gap-4 text-center">
                  <div>
                    <div className="text-2xl sm:text-3xl font-bold">{sessionStats.correct}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground mt-1">Correct</div>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-bold">{sessionStats.total}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground mt-1">Total Rounds</div>
                  </div>
                  <div>
                    <div className="text-2xl sm:text-3xl font-bold">{sessionAccuracy}%</div>
                    <div className="text-xs sm:text-sm text-muted-foreground mt-1">Accuracy</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* All-time Stats */}
          {stats && (
            <>
              <Card>
                <CardHeader>
                  <h2 className="text-xl sm:text-2xl font-semibold text-center">All-Time Performance</h2>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
                    <div className="text-center">
                      <div className="text-3xl sm:text-4xl font-bold">{stats.totalRounds}</div>
                      <div className="text-xs sm:text-sm text-muted-foreground mt-1">Total Rounds</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl sm:text-4xl font-bold">{stats.correctGuesses}</div>
                      <div className="text-xs sm:text-sm text-muted-foreground mt-1">Correct Guesses</div>
                    </div>
                    <div className="text-center col-span-2 md:col-span-1">
                      <div className="text-3xl sm:text-4xl font-bold text-primary">{stats.accuracy}%</div>
                      <div className="text-xs sm:text-sm text-muted-foreground mt-1">Overall Accuracy</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
                <Card>
                  <CardHeader>
                    <h3 className="text-lg sm:text-xl font-semibold">AI Detection</h3>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 sm:space-y-4">
                      <div>
                        <div className="text-2xl sm:text-3xl font-bold">{stats.aiDetectionRate}%</div>
                        <div className="text-xs sm:text-sm text-muted-foreground mt-1">Detection Rate</div>
                      </div>
                      <div>
                        <div className="text-xl sm:text-2xl font-semibold">{stats.aiRoundsPlayed}</div>
                        <div className="text-xs sm:text-sm text-muted-foreground mt-1">AI Rounds Played</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <h3 className="text-lg sm:text-xl font-semibold">Human Detection</h3>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 sm:space-y-4">
                      <div>
                        <div className="text-2xl sm:text-3xl font-bold">{stats.humanDetectionRate}%</div>
                        <div className="text-xs sm:text-sm text-muted-foreground mt-1">Detection Rate</div>
                      </div>
                      <div>
                        <div className="text-xl sm:text-2xl font-semibold">{stats.humanRoundsPlayed}</div>
                        <div className="text-xs sm:text-sm text-muted-foreground mt-1">Human Rounds Played</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href={"/solo" as any}>
              <Button size="lg" className="w-full sm:w-auto">
                Play Again
              </Button>
            </Link>
            <Link href="/">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SoloStatsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading stats...</div>
      </div>
    }>
      <StatsContent />
    </Suspense>
  )
}
