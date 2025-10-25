"use client"
import { useEffect, useRef } from 'react'

interface ScrollingWaveformProps {
  active?: boolean
  height?: number
  barCount?: number
  barWidth?: number
  barGap?: number
  barColor?: string
  speed?: number
  className?: string
}

export function ScrollingWaveform({
  active = false,
  height = 60,
  barCount = 32,
  barWidth = 4,
  barGap = 2,
  barColor = '#1F4B3A',
  speed = 50,
  className = '',
}: ScrollingWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const timeRef = useRef<number>(0)
  const barsRef = useRef<number[]>([])

  useEffect(() => {
    // Initialize bars with random heights
    if (barsRef.current.length === 0) {
      barsRef.current = Array.from({ length: barCount }, () => 0.2 + Math.random() * 0.6)
    }

    if (!active) {
      cleanup()
      drawStatic()
      return
    }

    animate()

    return cleanup
  }, [active, barCount])

  function animate() {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    animationRef.current = requestAnimationFrame(animate)

    timeRef.current += speed / 1000

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Calculate bar dimensions
    const totalBarWidth = barWidth + barGap
    const startX = (canvas.width - barCount * totalBarWidth + barGap) / 2

    // Update and draw bars with scrolling effect
    for (let i = 0; i < barCount; i++) {
      // Create smooth wave animation
      const waveOffset = Math.sin(timeRef.current + i * 0.3) * 0.3
      const targetHeight = barsRef.current[i] + waveOffset
      const normalizedHeight = Math.max(0.1, Math.min(1, targetHeight))
      
      const barHeight = Math.max(4, normalizedHeight * canvas.height * 0.7)

      const x = startX + i * totalBarWidth
      const y = (canvas.height - barHeight) / 2

      ctx.fillStyle = barColor
      ctx.beginPath()
      ctx.roundRect(x, y, barWidth, barHeight, 2)
      ctx.fill()
    }

    // Occasionally update some bar heights for variety
    if (Math.random() < 0.05) {
      const idx = Math.floor(Math.random() * barCount)
      barsRef.current[idx] = 0.2 + Math.random() * 0.6
    }
  }

  function drawStatic() {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const totalBarWidth = barWidth + barGap
    const startX = (canvas.width - barCount * totalBarWidth + barGap) / 2

    // Draw static bars with the current heights
    for (let i = 0; i < barCount; i++) {
      const barHeight = 4

      const x = startX + i * totalBarWidth
      const y = (canvas.height - barHeight) / 2

      ctx.fillStyle = '#B6ADA6'
      ctx.beginPath()
      ctx.roundRect(x, y, barWidth, barHeight, 2)
      ctx.fill()
    }
  }

  function cleanup() {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={barCount * (barWidth + barGap)}
      height={height}
      className={className}
    />
  )
}

