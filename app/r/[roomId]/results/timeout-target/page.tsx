import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function ResultTimeoutTarget({ params }: { params: { roomId: string } }) {
  return (
    <div className="centered-card">
      <Card className="w-full max-w-xl">
        <CardHeader className="text-lg font-semibold">⏰ TIME'S UP!</CardHeader>
        <CardContent className="space-y-4">
          <div>AI was active. Detector never clicked.</div>
          <div className="text-sm text-muted-foreground">🏆 TARGET WINS!</div>
          <div className="flex gap-3">
            <Link href="/"><Button>PLAY AGAIN</Button></Link>
            <Link href={`/r/${params.roomId}/analysis` as any}><Button variant="secondary">VIEW REPLAY</Button></Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
