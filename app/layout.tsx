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
      <head>
        {/* Apply saved theme synchronously to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}` }} />
      </head>
      <body className="font-sans antialiased bg-[var(--bg-app)] text-gray-900 dark:text-gray-100">
        {children}
      </body>
    </html>
  )
}
