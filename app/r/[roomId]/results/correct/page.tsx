import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function ResultCorrect({ params }: { params: { roomId: string } }) {
  return (
    <div className="centered-card">
      <Card className="w-full max-w-xl">
        <CardHeader className="text-lg font-semibold">✅ CORRECT!</CardHeader>
        <CardContent className="space-y-4">
          <div>Mike detected the AI!</div>
          <div className="text-sm text-muted-foreground">🏆 MIKE WINS!</div>
          <div className="flex gap-3">
            <Link href={`/r/${params.roomId}/analysis` as any}><Button variant="secondary">VIEW ANALYSIS</Button></Link>
            <Link href="/"><Button>PLAY AGAIN</Button></Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
