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
    this.options = { mimeType: 'audio/webm;codecs=opus', timesliceMs: 1000, ...options }
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

