import Image from 'next/image'
import Link from 'next/link'

export function LogoHeader() {
  return (
    <Link href="https://mimicry.fun" target="_blank" rel="noopener noreferrer">
      <div className="absolute top-8 left-8 flex items-center gap-3 z-20 cursor-pointer hover:opacity-80 transition-opacity">
        <Image src="/logo.svg" alt="Mimicry Logo" width={96} height={96} />
        <span className="text-3xl font-heading">mimicry</span>
      </div>
    </Link>
  )
}
