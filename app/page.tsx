import { LogoHeader } from '@/components/home/LogoHeader'
import { CircularText } from '@/components/home/CircularText'
import { GameCard } from '@/components/home/GameCard'

export default function HomePage() {
  return (
    <div className="relative min-h-screen flex items-center justify-center">
      <LogoHeader />
      <CircularText />
      <GameCard />
    </div>
  )
}
