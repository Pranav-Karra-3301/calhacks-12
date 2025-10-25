"use client"

export type RecorderOptions = {
  mimeType?: string
  timesliceMs?: number
  onChunk?: (blob: Blob, seq: number) => void
}

export class ChunkedRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private seq = 0
  private stream: MediaStream | null = null
  private options: RecorderOptions

  constructor(options: RecorderOptions = {}) {
    // Try MP3 first, fallback to WAV, then WebM as last resort
    const mimeType = options.mimeType || (
      MediaRecorder.isTypeSupported('audio/mpeg') 
        ? 'audio/mpeg' 
        : MediaRecorder.isTypeSupported('audio/wav')
        ? 'audio/wav'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm;codecs=opus'
    )
    
    this.options = { 
      mimeType, 
      timesliceMs: 3000, // 3 seconds for complete audio segments
      ...options 
    }
  }

  async start() {
    if (this.mediaRecorder) return
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: this.options.mimeType })
    this.seq = 0
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.options.onChunk?.(e.data, this.seq++)
      }
    }
    this.mediaRecorder.start(this.options.timesliceMs)
  }

  stop() {
    if (!this.mediaRecorder) return
    this.mediaRecorder.stop()
    this.stream?.getTracks().forEach(t => t.stop())
    this.mediaRecorder = null
    this.stream = null
  }
}

