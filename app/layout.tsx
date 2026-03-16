import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ThinkBot — AI til kritisk tænkning',
  description: 'Et pædagogisk AI-chatværktøj til danske grundskoler',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="da">
      <body className="font-sans antialiased bg-white text-gray-900">
        {children}
      </body>
    </html>
  )
}
