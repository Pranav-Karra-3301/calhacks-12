'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LiveWaveform } from '@/components/singleplayer/LiveWaveform'

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
  const [isExiting, setIsExiting] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startX = useRef(0)
  const hasAutoPlayed = useRef(false)

  // Autoplay on first load
  useEffect(() => {
    if (audioUrl && audioRef.current && !hasAutoPlayed.current && roundNumber === 1) {
      hasAutoPlayed.current = true
      // Small delay to ensure audio is loaded
      setTimeout(() => {
        playAudio()
      }, 500)
    }
  }, [audioUrl, roundNumber])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      if (audioUrl) audioRef.current.src = audioUrl
      else audioRef.current.removeAttribute('src')
      setIsPlaying(false)
    }
    setOffset(0)
    setIsExiting(false)
  }, [audioUrl, text])

  useEffect(() => {
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
    if (audioUrl && audioRef.current) {
      try {
        await audioRef.current.play()
        setIsPlaying(true)
      } catch (error) {
        console.error('Error playing audio:', error)
      }
    }
  }

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setIsPlaying(false)
  }

  const togglePlay = () => {
    if (disabled) return
    if (isPlaying) stopAudio()
    else playAudio()
  }

  const handleSwipe = (direction: 'left' | 'right') => {
    if (disabled || isExiting) return
    stopAudio()
    setIsExiting(true)

    // Animate card exit
    if (direction === 'left') {
      setOffset(-window.innerWidth)
    } else {
      setOffset(window.innerWidth)
    }

    // Wait for animation then trigger callback
    setTimeout(() => {
      onSwipe(direction)
    }, 300)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled || isExiting) return
    setIsDragging(true)
    startX.current = e.clientX
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled || isExiting) return
    setIsDragging(true)
    startX.current = e.touches[0].clientX
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || disabled || isExiting) return
    const delta = e.clientX - startX.current
    setOffset(delta)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || disabled || isExiting) return
    const delta = e.touches[0].clientX - startX.current
    setOffset(delta)
  }

  const handleEnd = () => {
    if (!isDragging || disabled || isExiting) return
    setIsDragging(false)
    const threshold = 100
    if (offset > threshold) handleSwipe('right')
    else if (offset < -threshold) handleSwipe('left')
    else setOffset(0)
  }

  const rotation = offset * 0.05
  const scale = 1 - Math.min(0.1, Math.abs(offset) / 1000)

  return (
    <div className="relative w-full h-full flex items-center justify-center pt-16">
      {/* Card Stack - Background cards */}
      <div className="absolute inset-0 flex items-center justify-center pt-16">
        {/* Third card (bottom of stack) */}
        <div
          className="absolute"
          style={{
            transform: 'translateY(16px) scale(0.9)',
            opacity: 0.3,
            zIndex: 0
          }}
        >
          <Card className="w-[90vw] max-w-2xl aspect-[3/4] bg-white/90 border border-border/50" />
        </div>

        {/* Second card */}
        <div
          className="absolute"
          style={{
            transform: 'translateY(8px) scale(0.95)',
            opacity: 0.5,
            zIndex: 1
          }}
        >
          <Card className="w-[90vw] max-w-2xl aspect-[3/4] bg-white/90 border border-border/70" />
        </div>
      </div>

      {/* Main Interactive Card */}
      <div
        className="relative w-[90vw] max-w-2xl"
        style={{
          transform: `translateX(${offset}px) rotate(${rotation}deg) scale(${scale})`,
          transition: isDragging || isExiting ? 'none' : 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
          touchAction: 'pan-y',
          zIndex: 10
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleEnd}
      >
        <Card className="cursor-grab active:cursor-grabbing select-none bg-white/95 backdrop-blur aspect-[3/4]">
          <CardContent className="flex h-full flex-col justify-center p-8">
            {/* Audio Section - Centered */}
            <div className="flex-1 flex flex-col items-center justify-center space-y-8">
              {/* Waveform - Full Width */}
              <div className="w-full">
                <LiveWaveform
                  audioRef={audioRef}
                  isActive={isPlaying}
                  className="h-32 w-full rounded-xl bg-[#F7F5F3]"
                />
              </div>

              {/* Play/Pause Button */}
              <Button
                size="lg"
                onClick={togglePlay}
                disabled={disabled || !audioUrl}
                variant={isPlaying ? "secondary" : "default"}
                className="min-w-[160px]"
              >
                {isPlaying ? 'Pause' : 'Play'}
              </Button>

              <audio
                ref={audioRef}
                onEnded={() => setIsPlaying(false)}
                onPause={() => setIsPlaying(false)}
                onError={(e) => console.error('Audio error:', e)}
                crossOrigin="anonymous"
                className="hidden"
              />
            </div>

            {/* Decision Buttons */}
            <div className="grid gap-4 grid-cols-2 mt-8">
              <Button
                variant="outline"
                size="lg"
                onClick={() => handleSwipe('left')}
                disabled={disabled || isExiting}
                className="w-full"
              >
                Human
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => handleSwipe('right')}
                disabled={disabled || isExiting}
                className="w-full"
              >
                AI
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Subtle swipe indicators */}
        {isDragging && offset !== 0 && (
          <>
            {/* Left indicator */}
            <div
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 -left-20 transition-opacity ${
                offset < -50 ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="text-4xl font-bold text-[#35302E]/30">
                HUMAN
              </div>
            </div>

            {/* Right indicator */}
            <div
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 -right-14 transition-opacity ${
                offset > 50 ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="text-4xl font-bold text-[#1F4B3A]/30">
                AI
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}