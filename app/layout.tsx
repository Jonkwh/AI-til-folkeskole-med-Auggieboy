// Imports the TypeScript type for Next.js page metadata (title, description shown in browser tabs and search results).
import type { Metadata } from 'next'
// Imports the global CSS file that applies to every page in the app.
import './globals.css'

// Defines the default browser tab title and meta description for the entire app.
export const metadata: Metadata = {
  title: 'ThinkBot — AI til kritisk tænkning',
  description: 'Et pædagogisk AI-chatværktøj til danske grundskoler',
}

// The root layout wraps every page — any HTML or components placed here appear on all pages.
export default function RootLayout({
  children, // The content of whichever page is currently being visited.
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="da"> {/* Sets the page language to Danish for screen readers and browsers. */}
      <head>
        {/* Runs a tiny inline script before the page paints to restore the user's dark/light preference.
            Without this, there is a brief flash of the wrong theme while JavaScript loads. */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}` }} />
      </head>
      {/* Applies base font, anti-aliasing, and the CSS variable–driven background and text colors. */}
      <body className="font-sans antialiased bg-[var(--bg-app)] text-gray-900 dark:text-gray-100">
        {children} {/* Renders the active page inside the shared layout. */}
      </body>
    </html>
  )
}
