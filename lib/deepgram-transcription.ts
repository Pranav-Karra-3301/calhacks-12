"use client"

import { createClient, LiveClient, LiveTranscriptionEvents } from '@deepgram/sdk'

export type DeepgramTranscriptCallback = (data: {
  transcript: string
  speaker?: number
  isFinal: boolean
  words?: Array<{ word: string; start: number; end: number; speaker?: number }>
}) => void

export type DeepgramErrorCallback = (error: Error) => void

export class DeepgramLiveTranscriber {
  private deepgramClient: any
  private connection: LiveClient | null = null
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private apiKey: string
  private onTranscript: DeepgramTranscriptCallback
  private onError: DeepgramErrorCallback

  constructor(
    apiKey: string,
    onTranscript: DeepgramTranscriptCallback,
    onError: DeepgramErrorCallback
  ) {
    this.apiKey = apiKey
    this.onTranscript = onTranscript
    this.onError = onError
  }

  async start() {
    try {
      console.log('[Deepgram] Initializing live transcription...')

      // Create Deepgram client
      this.deepgramClient = createClient(this.apiKey)

      // Open WebSocket connection with Nova-3 and diarization
      this.connection = this.deepgramClient.listen.live({
        model: 'nova-3',
        language: 'en',
        smart_format: true,
        diarize: true,          // Enable speaker identification!
        punctuate: true,
        utterances: true,       // Get complete utterances
        interim_results: true,  // Real-time updates
      })
      if (!this.connection) {
        throw new Error('Failed to open Deepgram live connection')
      }
      const connection = this.connection

      // Set up event listeners
      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log('[Deepgram] WebSocket connection opened')
        this.startMicrophoneStream()
      })

      connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript
        const words = data.channel?.alternatives?.[0]?.words || []
        const isFinal = data.is_final || false
        const speaker = words.length > 0 ? words[0]?.speaker : undefined

        if (transcript && transcript.trim().length > 0) {
          console.log(`[Deepgram] Transcript (${isFinal ? 'final' : 'interim'}, speaker ${speaker}):`, transcript)

          this.onTranscript({
            transcript,
            speaker,
            isFinal,
            words,
          })
        }
      })

      connection.on(LiveTranscriptionEvents.Error, (error: any) => {
        console.error('[Deepgram] WebSocket error:', error)
        this.onError(new Error(error.message || 'Deepgram connection error'))
      })

      connection.on(LiveTranscriptionEvents.Warning, (warning: any) => {
        console.warn('[Deepgram] Warning:', warning)
      })

      connection.on(LiveTranscriptionEvents.Close, () => {
        console.log('[Deepgram] WebSocket connection closed')
      })

      connection.on(LiveTranscriptionEvents.Metadata, (metadata: any) => {
        console.log('[Deepgram] Metadata received:', metadata)
      })

    } catch (error) {
      console.error('[Deepgram] Failed to start:', error)
      this.onError(error instanceof Error ? error : new Error('Failed to start Deepgram'))
    }
  }

  private async startMicrophoneStream() {
    try {
      console.log('[Deepgram] Starting microphone stream...')

      // Get microphone access with enhanced audio settings
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      // Determine best MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/wav'

      console.log('[Deepgram] Using MIME type:', mimeType)

      // Create MediaRecorder to capture audio chunks
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
      })

      // Send audio chunks to Deepgram as they become available
      this.mediaRecorder.ondataavailable = (event) => {
        if (
          event.data.size > 0 &&
          this.connection &&
          this.connection.getReadyState() === 1 // WebSocket.OPEN
        ) {
          this.connection.send(event.data)
        }
      }

      this.mediaRecorder.onerror = (event) => {
        console.error('[Deepgram] MediaRecorder error:', event)
        this.onError(new Error('MediaRecorder error'))
      }

      // Start recording in 250ms chunks for continuous streaming
      this.mediaRecorder.start(250)
      console.log('[Deepgram] Microphone streaming started (250ms chunks)')

    } catch (error) {
      console.error('[Deepgram] Failed to start microphone:', error)
      this.onError(
        error instanceof Error ? error : new Error('Failed to access microphone')
      )
    }
  }

  stop() {
    console.log('[Deepgram] Stopping transcription...')

    // Stop media recorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }

    // Stop all audio tracks
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
    }

    // Close WebSocket connection
    if (this.connection) {
      this.connection.finish()
    }

    // Clean up
    this.mediaRecorder = null
    this.stream = null
    this.connection = null

    console.log('[Deepgram] Stopped successfully')
  }

  isActive(): boolean {
    return (
      this.connection !== null &&
      this.connection.getReadyState() === 1 &&
      this.mediaRecorder !== null &&
      this.mediaRecorder.state === 'recording'
    )
  }
}
