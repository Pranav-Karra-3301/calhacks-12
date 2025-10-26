'use client'

import { useEffect, useRef } from 'react'

type LiveWaveformProps = {
  audioRef: React.RefObject<HTMLAudioElement>
  isActive: boolean
  className?: string
}

export function LiveWaveform({ audioRef, isActive, className }: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const connectionReadyRef = useRef(false)

  // Set up the audio graph once.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const audioElement = audioRef.current
    if (!audioElement) return

    const AudioContextClass =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AudioContextClass) return

    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContextClass()
    }

    const audioContext = audioContextRef.current
    if (!audioContext) return

    if (!sourceRef.current) {
      try {
        sourceRef.current = audioContext.createMediaElementSource(audioElement)
      } catch (error) {
        // The media element is already connected; ignore duplicate errors.
        return
      }
    }

    if (!analyserRef.current) {
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.85
      analyserRef.current = analyser
    }

    if (!connectionReadyRef.current && sourceRef.current && analyserRef.current) {
      sourceRef.current.connect(analyserRef.current)
      analyserRef.current.connect(audioContext.destination)
      connectionReadyRef.current = true
    }
  }, [audioRef])

  // Handle canvas resize for crisp lines.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const canvas = canvasRef.current
    if (!canvas) return

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      canvas.width = rect.width * ratio
      canvas.height = rect.height * ratio
      const context = canvas.getContext('2d')
      if (context) {
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.scale(ratio, ratio)
      }
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [])

  // Draw waveform when active.
  useEffect(() => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return
    const context = canvas.getContext('2d')
    if (!context) return

    const drawWaveform = () => {
      if (!analyser) return
      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      analyser.getByteTimeDomainData(dataArray)

      const rect = canvas.getBoundingClientRect()
      const width = rect.width
      const height = rect.height
      context.clearRect(0, 0, width, height)
      context.fillStyle = 'rgba(15,23,42,0.03)'
      context.fillRect(0, 0, width, height)

      context.lineWidth = 2
      context.strokeStyle = '#0f766e'
      context.beginPath()

      const sliceWidth = (width / bufferLength) * 1.2
      let x = 0
      for (let i = 0; i < bufferLength; i += 2) {
        const v = dataArray[i] / 128.0
        const y = (v * height) / 2
        if (i === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
        x += sliceWidth
      }

      context.stroke()
      animationRef.current = requestAnimationFrame(drawWaveform)
    }

    if (isActive) {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {})
      }
      drawWaveform()
    } else {
      // Draw static waveform hint when not playing
      const rect = canvas.getBoundingClientRect()
      const width = rect.width
      const height = rect.height
      context.clearRect(0, 0, width, height)

      // Draw subtle static waveform hint
      context.lineWidth = 2
      context.strokeStyle = '#1F4B3A'
      context.globalAlpha = 0.2
      context.beginPath()

      const points = 50
      const amplitude = height * 0.15
      const centerY = height / 2

      for (let i = 0; i <= points; i++) {
        const x = (width / points) * i
        const randomOffset = (Math.sin(i * 0.5) + Math.sin(i * 0.3) * 0.5) * amplitude
        const y = centerY + randomOffset

        if (i === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      }

      context.stroke()
      context.globalAlpha = 1
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = undefined
      }
    }
  }, [isActive])

  return (
    <canvas
      ref={canvasRef}
      className={className ?? 'h-24 w-full rounded-lg bg-transparent'}
      aria-hidden="true"
    />
  )
}
