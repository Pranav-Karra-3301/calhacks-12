'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface SwipeCardProps {
  audioUrl: string | null
  text?: string
  onSwipe: (direction: 'left' | 'right') => void
  roundNumber: number
  disabled?: boolean
}

export function SwipeCard({ audioUrl, text, onSwipe, roundNumber, disabled }: SwipeCardProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [offset, setOffset] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const startX = useRef(0)

  useEffect(() => {
    // Reset audio when audioUrl changes
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setIsPlaying(false)
    }
    setOffset(0)
  }, [audioUrl, text])

  useEffect(() => {
    // Keyboard handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return
      if (e.key === 'ArrowLeft') {
        handleSwipe('left')
      } else if (e.key === 'ArrowRight') {
        handleSwipe('right')
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        togglePlay()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [disabled, isPlaying, audioUrl, text])

  const playAudio = async () => {
    if (audioUrl) {
      // Play from data URL
      if (audioRef.current) {
        audioRef.current.src = audioUrl
        await audioRef.current.play()
        setIsPlaying(true)
      }
    } else if (text && 'speechSynthesis' in window) {
      // Use speech synthesis for "human" audio
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.9
      utterance.pitch = 1.0
      utterance.onend = () => setIsPlaying(false)
      speechSynthesis.speak(utterance)
      setIsPlaying(true)
    }
  }

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel()
    }
    setIsPlaying(false)
  }

  const togglePlay = () => {
    if (isPlaying) {
      stopAudio()
    } else {
      playAudio()
    }
  }

  const handleSwipe = (direction: 'left' | 'right') => {
    if (disabled) return
    stopAudio()
    onSwipe(direction)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return
    setIsDragging(true)
    startX.current = e.clientX
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled) return
    setIsDragging(true)
    startX.current = e.touches[0].clientX
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || disabled) return
    const delta = e.clientX - startX.current
    setOffset(delta)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || disabled) return
    const delta = e.touches[0].clientX - startX.current
    setOffset(delta)
  }

  const handleEnd = () => {
    if (!isDragging || disabled) return
    setIsDragging(false)

    const threshold = 100
    if (offset > threshold) {
      handleSwipe('right')
    } else if (offset < -threshold) {
      handleSwipe('left')
    }
    setOffset(0)
  }

  const rotation = offset * 0.1
  const opacity = 1 - Math.abs(offset) / 500

  return (
    <div className="relative w-full max-w-2xl mx-auto px-4">
      <div className="mb-6 text-center">
        <div className="text-sm text-muted-foreground">Round {roundNumber}</div>
      </div>

      <div
        ref={cardRef}
        className="relative"
        style={{
          transform: `translateX(${offset}px) rotate(${rotation}deg)`,
          opacity,
          transition: isDragging ? 'none' : 'all 0.3s ease-out',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleEnd}
      >
        <Card className="w-full aspect-square flex flex-col justify-center cursor-grab active:cursor-grabbing select-none">
          <CardContent className="flex flex-col items-center justify-center space-y-8 p-8">
            {/* Audio player */}
            <div className="w-full max-w-md space-y-4">
              <div className="flex justify-center">
                <Button
                  size="lg"
                  onClick={togglePlay}
                  disabled={disabled}
                  className="w-32 h-32 rounded-full text-4xl"
                >
                  {isPlaying ? '⏸' : '▶'}
                </Button>
              </div>
              <audio
                ref={audioRef}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />
            </div>

            {/* Instructions */}
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">Listen and decide</p>
              <p className="text-sm text-muted-foreground">
                Swipe left if HUMAN, right if AI
              </p>
              <p className="text-xs text-muted-foreground">
                Or use ← and → arrow keys
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Swipe indicators */}
        {offset < -50 && (
          <div className="absolute top-1/2 left-8 -translate-y-1/2 text-6xl opacity-50">
            👤
          </div>
        )}
        {offset > 50 && (
          <div className="absolute top-1/2 right-8 -translate-y-1/2 text-6xl opacity-50">
            🤖
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex justify-between mt-8 px-8 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="text-2xl">👤</span>
          <span>Human</span>
        </div>
        <div className="flex items-center gap-2">
          <span>AI</span>
          <span className="text-2xl">🤖</span>
        </div>
      </div>
    </div>
  )
}

