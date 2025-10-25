'use client'

const headlines = [
  "Can you tell who's real?",
  'A social deception game for the age of AI',
  "The world's first social Turing test",
]

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

      {/* Mobile: Scrolling ticker pinned to the very top */}
      <div className="md:hidden fixed top-0 left-0 w-full px-3 pointer-events-none z-30">
        <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-full border border-white/20 bg-background/90 backdrop-blur">
          <div className="flex w-max animate-scroll whitespace-nowrap py-2 text-xs font-heading uppercase tracking-[0.3em] text-muted-foreground">
            {[...Array(2)].map((_, idx) => (
              <div key={idx} className="flex">
                {headlines.map(headline => (
                  <span key={`${headline}-${idx}`} className="inline-block px-4">
                    {headline}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
