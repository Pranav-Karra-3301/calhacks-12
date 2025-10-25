"use client"
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MicrophoneIndicator } from '@/components/MicrophoneIndicator'
import { Timer } from '@/components/Timer'
import { SecretOptionCard } from '@/components/SecretOptionCard'
import { DetectorGuessCard } from '@/components/DetectorGuessCard'
import { useEffect, useRef, useState } from 'react'
import { ChunkedRecorder } from '@/lib/recorder'
import { supabase, functionsUrl, getAccessToken } from '@/lib/supabase'
import { fnActivateAI, fnDetectorGuess } from '@/lib/functions'

export default function TalkPage({ params }: { params: { roomId: string } }) {
  const search = useSearchParams()
  const role = search.get('role') || 'detector' // 'target' or 'detector'
  const roomId = params.roomId
  const [transcript, setTranscript] = useState<string>("")
  const recRef = useRef<ChunkedRecorder | null>(null)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function start() {
      recRef.current = new ChunkedRecorder({
        timesliceMs: 1200,
        onChunk: async (blob, seq) => {
          try {
            if (muted) return
            const { data: auth } = await supabase.auth.getUser()
            const uid = auth.user?.id
            if (!uid) return
            const ts = Date.now()
            const chunkId = `${ts}-${seq}`
            // upload to storage for replay + event
            await supabase.storage.from('recordings').upload(
              `rooms/${roomId}/utterances/${chunkId}.webm`,
              blob,
              { upsert: true, contentType: 'audio/webm', metadata: { uid } as any }
            )
            // call Groq via Edge Function
            const token = await getAccessToken()
            const fxUrl = `${functionsUrl()}/transcribe-chunk?roomId=${encodeURIComponent(roomId)}&chunkId=${encodeURIComponent(chunkId)}&seq=${seq}`
            const res = await fetch(fxUrl, {
              method: 'POST',
              headers: {
                'Authorization': token ? `Bearer ${token}` : '',
                'Content-Type': 'audio/webm'
              },
              body: blob,
            })
            const j = await res.json()
            if (j?.text && !cancelled) setTranscript(prev => (prev ? prev + ' ' : '') + j.text)
          } catch (e) {
            // ignore transient errors
          }
        }
      })
      await recRef.current.start()
    }
    start()
    return () => { cancelled = true; recRef.current?.stop(); recRef.current = null }
  }, [roomId, muted])

  async function onActivateAI() {
    await fnActivateAI(roomId)
  }
  async function onDetectorGuess() {
    await fnDetectorGuess(roomId)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="text-lg font-semibold">💬 CONVERSATION MODE</div>
          <div className="text-sm text-muted-foreground">Topic: "What\'s your favorite food and why?"</div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm">🔴 Speaker • ⚪ You</div>
            <div className="text-sm">⏱️ Time: <Timer /></div>
          </div>
          <MicrophoneIndicator active />
          <div className="grid md:grid-cols-2 gap-4 mt-2">
            {role === 'target' ? (
              <SecretOptionCard onClick={onActivateAI} />
            ) : (
              <div />
            )}
            <DetectorGuessCard onGuess={onDetectorGuess} />
          </div>
          <div className="text-sm whitespace-pre-wrap p-3 rounded border bg-muted/30">
            {transcript || 'Transcription appears here...'}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setMuted(m => !m)}>{muted ? 'Unmute' : 'Mute'}</Button>
            <Button variant="outline">Leave</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
