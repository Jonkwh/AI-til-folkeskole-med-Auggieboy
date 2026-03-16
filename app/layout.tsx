import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ThinkBot — AI for Critical Thinking',
  description: 'An educational AI chat tool for Danish lower-secondary schools',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-white text-gray-900">
        {children}
      </body>
    </html>
  )
}
