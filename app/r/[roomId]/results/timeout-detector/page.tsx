import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function ResultTimeoutDetector() {
  return (
    <div className="centered-card">
      <Card className="w-full max-w-xl">
        <CardHeader className="text-lg font-semibold">⏰ TIME'S UP!</CardHeader>
        <CardContent className="space-y-4">
          <div>Conversation ended. Target never activated AI.</div>
          <div className="text-sm text-muted-foreground">🏆 DETECTOR WINS!</div>
          <div className="flex gap-3">
            <Link href="/"><Button>PLAY AGAIN</Button></Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
