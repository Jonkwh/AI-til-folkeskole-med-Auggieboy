// Imports the server-side redirect helper to protect this page from unauthenticated access.
import { redirect } from 'next/navigation'
// Imports the server-side Supabase client to verify the user's session before rendering.
import { createServerSupabaseClient } from '@/lib/supabase-server'
// Imports the component where teachers configure the bot's role, grade, subject, and restrictions.
import MasterpromptBuilder from '@/components/MasterpromptBuilder'

// The builder page ("/builder") — where teachers create a masterprompt before starting a chat session.
export default async function BuilderPage() {
  // Creates a Supabase client that reads the user's session from the request cookies.
  const supabase = createServerSupabaseClient()
  // Fetches the currently logged-in user. Returns null if the session is missing or expired.
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Unauthenticated visitors are redirected to the login page before anything is rendered.
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-[var(--bg-app)]">
      {/* Top navigation bar with the ThinkBot logo and the logged-in teacher's email address. */}
      <header className="bg-[var(--bg-surface)] border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Circular "TB" logo badge. */}
            <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
              <span className="text-white text-xs font-bold">TB</span>
            </div>
            <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">ThinkBot</span>
          </div>
          {/* Displays the teacher's email so they can confirm which account they are logged in as. */}
          <span className="text-xs text-gray-400 dark:text-gray-500">{user.email}</span>
        </div>
      </header>

      {/* Main content area containing the masterprompt builder form. */}
      <main className="py-8">
        <MasterpromptBuilder />
      </main>
    </div>
  )
}
