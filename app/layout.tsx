import type { Metadata } from 'next'
import { Instrument_Serif, Roboto } from 'next/font/google'
import './globals.css'

const headingFont = Instrument_Serif({ subsets: ['latin'], weight: ['400'], variable: '--font-heading' })
const bodyFont = Roboto({ subsets: ['latin'], weight: ['300', '400', '500', '700'], variable: '--font-body' })

export const metadata: Metadata = {
  title: 'THE MIMIC GAME',
  description: '1v1 AI Detection Challenge'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${headingFont.variable} ${bodyFont.variable}`}>
      <body className="app-body font-body">
        <div className="app-shell">
          {children}
        </div>
      </body>
    </html>
  )
}
