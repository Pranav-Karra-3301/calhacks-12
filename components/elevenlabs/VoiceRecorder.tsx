"use client"
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export function VoiceRecorder({ label = 'START RECORDING', seconds = 10, onFinish }: { label?: string; seconds?: number; onFinish?: (blob: Blob) => void }) {
  const [recording, setRecording] = useState(false)
  const [timeLeft, setTimeLeft] = useState(seconds)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  async function handleClick() {
    if (recording) return
    setRecording(true)
    setTimeLeft(seconds)
    chunksRef.current = []
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
    recRef.current = rec
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
    rec.start()
    const start = Date.now()
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000)
      const left = Math.max(0, seconds - elapsed)
      setTimeLeft(left)
      if (left === 0) {
        clearInterval(timer)
        rec.stop()
        stream.getTracks().forEach(t => t.stop())
      }
    }, 250)
    rec.onstop = () => {
      setRecording(false)
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      onFinish?.(blob)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={handleClick} disabled={recording}>{label}</Button>
      <div className="text-sm">⏱️ {timeLeft}s</div>
    </div>
  )
}
