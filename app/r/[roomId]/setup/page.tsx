"use client"
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { VoiceRecorder } from '@/components/elevenlabs/VoiceRecorder'
import { supabase } from '@/lib/supabase'
import { useState } from 'react'

export default function VoiceSetupPage({ params }: { params: { roomId: string } }) {
  const { roomId } = params
  const [message, setMessage] = useState<string | null>(null)

  async function uploadSetupSample(blob: Blob) {
    setMessage('Uploading...')
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) { setMessage('Sign in required'); return }
    const path = `rooms/${roomId}/users/${uid}/setup-sample.webm`
    const { error } = await supabase.storage.from('recordings').upload(path, blob, { contentType: 'audio/webm', upsert: true })
    if (error) setMessage(error.message)
    else setMessage('Uploaded sample. Proceed when both are done.')
  }
  return (
    <div className="centered-card">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="text-lg font-semibold">🎙️ VOICE SETUP</div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="font-medium">Player 1, read this:</div>
            <div className="text-muted-foreground">"Hello, I\'m Sarah and I love playing games online."</div>
            <VoiceRecorder label="START RECORDING" seconds={10} onFinish={uploadSetupSample as any} />
          </div>
          <div className="space-y-2">
            <div className="font-medium">Now Player 2\'s turn!</div>
            <div className="text-muted-foreground">"Hello, I\'m Mike and I love playing games online."</div>
            <VoiceRecorder label="START RECORDING" seconds={10} onFinish={uploadSetupSample as any} />
          </div>
          <div className="text-sm text-muted-foreground">Room: {roomId}</div>
          {message && <div className="text-sm">{message}</div>}
        </CardContent>
      </Card>
    </div>
  )
}
