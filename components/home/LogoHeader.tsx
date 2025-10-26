import Image from 'next/image'
import Link from 'next/link'

export function LogoHeader() {
  return (
    <Link href="https://mimicry.fun" target="_blank" rel="noopener noreferrer">
      <div className="absolute top-4 left-4 sm:top-6 sm:left-6 md:top-8 md:left-8 flex items-center gap-2 sm:gap-3 z-20 cursor-pointer hover:opacity-80 transition-opacity">
        <Image
          src="/logo.svg"
          alt="Mimicry Logo"
          width={64}
          height={64}
          className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20"
        />
        <span className="text-xl sm:text-2xl md:text-3xl font-heading">mimicry</span>
      </div>
    </Link>
  )
}
