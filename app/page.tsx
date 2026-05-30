// Imports the redirect function used to send the user to a different URL from the server side.
import { redirect } from 'next/navigation'
// Imports the server-side Supabase client factory to check the user's login status before rendering.
import { createServerSupabaseClient } from '@/lib/supabase-server'

// The root page ("/") — never renders anything; only redirects based on auth status.
export default async function HomePage() {
  // Creates a server-side Supabase client that can read the user's session from cookies.
  const supabase = createServerSupabaseClient()
  // Fetches the currently logged-in user. Returns null if no session exists.
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Logged-in users are sent directly to the builder where they can start a chat.
    redirect('/builder')
  } else {
    // Visitors without a session are sent to the login page.
    redirect('/login')
  }
}
