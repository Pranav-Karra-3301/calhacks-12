'use client'

export function CircularText() {
  return (
    <>
      <style jsx>{`
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-rotate {
          animation: rotate 40s linear infinite;
        }
        .animate-scroll {
          animation: scroll 30s linear infinite;
        }
      `}</style>

      {/* Desktop: Circular text - behind card */}
      <div className="hidden md:flex absolute inset-0 items-center justify-center pointer-events-none z-0">
        <div className="relative animate-rotate w-[120vmin] h-[120vmin] max-w-[1000px] max-h-[1000px]">
          <svg viewBox="0 0 1000 1000" className="w-full h-full">
            <defs>
              <path
                id="circlePath"
                d="M 500, 500 m -450, 0 a 450,450 0 1,1 900,0 a 450,450 0 1,1 -900,0"
              />
            </defs>
            <text className="fill-current text-[#71717a] font-heading" style={{ fontSize: '30px', letterSpacing: '0.05em' }}>
              <textPath href="#circlePath" startOffset="0%">
                Can you tell who's real? – A social deception game for the age of AI. – The world's first social Turing test. – Can you tell who's real? – A social deception game for the age of AI. – The world's first social Turing test. –
              </textPath>
            </text>
          </svg>
        </div>
      </div>

      {/* Mobile: Scrolling marquee - behind card */}
      <div className="md:hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full overflow-hidden pointer-events-none z-0">
        <div className="relative w-full">
          <div className="flex animate-scroll whitespace-nowrap">
            <span className="inline-block px-8 text-lg text-muted-foreground font-heading">Can you tell who's real?</span>
            <span className="inline-block px-8 text-lg text-muted-foreground font-heading">A social deception game for the age of AI</span>
            <span className="inline-block px-8 text-lg text-muted-foreground font-heading">The world's first social Turing test</span>
            <span className="inline-block px-8 text-lg text-muted-foreground font-heading">Can you tell who's real?</span>
            <span className="inline-block px-8 text-lg text-muted-foreground font-heading">A social deception game for the age of AI</span>
            <span className="inline-block px-8 text-lg text-muted-foreground font-heading">The world's first social Turing test</span>
          </div>
        </div>
      </div>
    </>
  )
}
