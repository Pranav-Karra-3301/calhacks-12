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
  level?: number
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
  level,
}: ScrollingWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const timeRef = useRef<number>(0)
  const barsRef = useRef<number[]>([])
  const currentLevelRef = useRef(0)
  const targetLevelRef = useRef(0)

  const useLevelInput = typeof level === 'number'

  useEffect(() => {
    targetLevelRef.current = Math.max(0, Math.min(1, level ?? 0))
  }, [level])

  useEffect(() => {
    // Initialize bars with random heights
    if (barsRef.current.length !== barCount) {
      barsRef.current = Array.from({ length: barCount }, () => 0.2 + Math.random() * 0.6)
    }

    if (!active) {
      cleanup()
      currentLevelRef.current = targetLevelRef.current
      drawStatic()
      return
    }

    animate()

    return cleanup
  }, [active, barCount, useLevelInput])

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
    const usesLevel = useLevelInput
    if (usesLevel) {
      const diff = targetLevelRef.current - currentLevelRef.current
      currentLevelRef.current += diff * 0.2
    }
    const smoothedLevel = currentLevelRef.current

    for (let i = 0; i < barCount; i++) {
      let normalizedHeight: number
      if (usesLevel) {
        const seed = barsRef.current[i]
        const variance = 0.4 + seed * 0.6
        normalizedHeight = Math.max(0.08, Math.min(1, smoothedLevel * variance))
      } else {
        const waveOffset = Math.sin(timeRef.current + i * 0.3) * 0.3
        const targetHeight = barsRef.current[i] + waveOffset
        normalizedHeight = Math.max(0.1, Math.min(1, targetHeight))
      }

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
    const idleLevel = useLevelInput ? Math.max(0.05, targetLevelRef.current * 0.5) : 0.1

    for (let i = 0; i < barCount; i++) {
      const barHeight = Math.max(4, idleLevel * canvas.height * 0.3)

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
