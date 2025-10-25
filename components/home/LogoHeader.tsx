import Image from 'next/image'

export function LogoHeader() {
  return (
    <div className="absolute top-8 left-8 flex items-center gap-3 z-20">
      <Image src="/logo.svg" alt="Mimicry Logo" width={96} height={96} />
      <span className="text-3xl font-heading">mimicry</span>
    </div>
  )
}
