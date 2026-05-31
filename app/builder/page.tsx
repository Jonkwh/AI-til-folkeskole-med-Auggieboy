// ─────────────────────────────────────────────────────────────────────────────
// MODULE: app/builder/page.tsx
// PURPOSE: The masterprompt builder page, served at the URL "/builder".
//          This is where a teacher lands after logging in. They use the builder
//          form to choose the bot's role, the student's grade and subject, and
//          any topic restrictions — then click "Start chat" to create a new session.
//          This is a server component: authentication is checked before any HTML
//          is sent to the browser, so unauthenticated users are never shown this page.
// ─────────────────────────────────────────────────────────────────────────────

// Imports 'redirect' — a Next.js function that stops rendering and sends the browser to a new URL.
import { redirect } from 'next/navigation'

// Imports the server-side Supabase client factory to check login state before rendering.
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Imports the MasterpromptBuilder component — the interactive form with dropdowns,
// checkboxes, and a live preview that lets teachers configure the bot's behaviour.
import MasterpromptBuilder from '@/components/MasterpromptBuilder'

// ─────────────────────────────────────────────────────────────────────────────
// 'BuilderPage' is an exported async function (a Next.js Server Component).
// "async" means it can pause with 'await' to check the database before rendering.
// It takes no parameters — Next.js calls it automatically when "/builder" is visited.
// It returns JSX: the builder page layout, or a redirect (no return value) if not logged in.
// ─────────────────────────────────────────────────────────────────────────────
export default async function BuilderPage() {

  // 'supabase' is a constant holding the server-side Supabase client object.
  const supabase = createServerSupabaseClient()

  // 'user' is an object (or null) — the currently logged-in teacher's account data.
  // If null, the session has expired or never existed.
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // 'user' is null — not logged in. Redirect to login before rendering anything.
    redirect('/login')
  }

  return (
    // Full-height page wrapper using the app's CSS variable background colour.
    <div className="min-h-screen bg-[var(--bg-app)]">

      {/* Top navigation bar: ThinkBot logo on the left, teacher email on the right. */}
      <header className="bg-[var(--bg-surface)] border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Small square "TB" logo badge — consistent with the sidebar branding. */}
            <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
              <span className="text-white text-xs font-bold">TB</span>
            </div>
            <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">ThinkBot</span>
          </div>
          {/* 'user.email' is a string — the teacher's email address, shown to confirm which account is active. */}
          <span className="text-xs text-gray-400 dark:text-gray-500">{user.email}</span>
        </div>
      </header>

      {/* Main content area — renders the MasterpromptBuilder form centred on the page. */}
      <main className="py-8">
        <MasterpromptBuilder />
      </main>

    </div>
  )
}
