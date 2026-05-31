// ─────────────────────────────────────────────────────────────────────────────
// MODULE: app/layout.tsx
// PURPOSE: The root layout that wraps every single page in the application.
//          Anything placed here — HTML tags, styles, scripts — appears on all pages.
//          This file sets the page language, registers the SEO metadata (browser tab
//          title and description), applies global CSS, and injects a tiny inline
//          script that restores the user's dark/light theme before the page paints
//          to avoid a visible flash of the wrong theme.
// ─────────────────────────────────────────────────────────────────────────────

// Imports the 'Metadata' TypeScript type from Next.js.
// A type is not real code — it is a description of the shape an object must have.
// This particular type describes which fields (title, description, etc.) are valid
// in the metadata export below.
import type { Metadata } from 'next'

// Imports the global CSS file. Importing it here makes its styles available on every page.
// This file contains CSS variables like --bg-app and --border used throughout the app.
import './globals.css'

// ─────────────────────────────────────────────────────────────────────────────
// 'metadata' is an exported constant (an object) of type Metadata.
// Next.js reads this object automatically and uses it to generate the <title> and
// <meta name="description"> tags in the HTML <head> for every page.
// These values appear in browser tabs and in search engine result previews.
// ─────────────────────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: 'ThinkBot — AI til kritisk tænkning', // String: the browser tab title.
  description: 'Et pædagogisk AI-chatværktøj til danske grundskoler', // String: the SEO description.
}

// ─────────────────────────────────────────────────────────────────────────────
// 'RootLayout' is an exported function (a Next.js Root Layout component).
// It takes one parameter:
//   - 'children' (type: React.ReactNode): the content of whichever page is currently
//     being visited. React.ReactNode is a type that means "any renderable React content."
// It returns the full HTML document structure (<html>, <head>, <body>) that wraps every page.
// ─────────────────────────────────────────────────────────────────────────────
export default function RootLayout({
  children,
}: {
  children: React.ReactNode // The active page's content, injected by Next.js automatically.
}) {
  return (
    <html lang="da"> {/* lang="da" sets the document language to Danish for screen readers and browser spelling. */}
      <head>
        {/* This inline <script> tag runs synchronously before the page paints.
            It checks localStorage for a saved 'theme' value and, if 'dark',
            immediately adds the 'dark' CSS class to <html>.
            Without this script, there is a brief flash of the light theme while
            JavaScript (including the useDarkMode hook) loads — this prevents that.
            'dangerouslySetInnerHTML' is a React prop that injects raw HTML — it is
            named "dangerous" to remind developers to never put user-controlled
            content here, as that would be a security risk (XSS). */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}` }} />
      </head>

      {/* 'font-sans' and 'antialiased' are Tailwind utility classes for base typography.
          The CSS variable classes (bg-[var(--bg-app)]) use values defined in globals.css
          and switch automatically between light and dark values when the 'dark' class is present. */}
      <body className="font-sans antialiased bg-[var(--bg-app)] text-gray-900 dark:text-gray-100">
        {children} {/* The current page's content is rendered here, inside the shared layout. */}
      </body>
    </html>
  )
}
