import type { Metadata } from 'next'
import { Instrument_Serif, Roboto } from 'next/font/google'
import './globals.css'

const headingFont = Instrument_Serif({ subsets: ['latin'], weight: ['400'], variable: '--font-heading' })
const bodyFont = Roboto({ subsets: ['latin'], weight: ['300', '400', '500', '700'], variable: '--font-body' })

export const metadata: Metadata = {
  title: 'Mimicry',
  description: 'can you differentiate your friends from ai?',
  icons: {
    icon: '/logo.svg',
  },
  openGraph: {
    title: 'Mimicry',
    description: 'can you differentiate your friends from ai?',
    url: 'https://play.mimicry.fun',
    siteName: 'Mimicry',
    images: [
      {
        url: '/preview.png',
        width: 1200,
        height: 630,
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mimicry',
    description: 'can you differentiate your friends from ai?',
    images: ['/preview.png'],
  },
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
