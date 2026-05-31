// ─────────────────────────────────────────────────────────────────────────────
// MODULE: app/page.tsx
// PURPOSE: The root entry-point page of the application, served at the URL "/".
//          It never renders any visible content — its only job is to check whether
//          the current visitor is logged in and redirect them to the right page.
//          Logged-in users go to /builder; anonymous visitors go to /login.
// HOW IT WORKS: Next.js runs this function on the server before sending any HTML
//          to the browser. The auth check and redirect both happen server-side,
//          so the user never sees a blank "/" page — they jump straight to their destination.
// ─────────────────────────────────────────────────────────────────────────────

// Imports 'redirect', a function provided by Next.js that stops the current render
// and sends the browser to a different URL. It takes one string parameter (the path).
import { redirect } from 'next/navigation'

// Imports the server-side Supabase client factory so this server component can
// check the user's authentication status before deciding where to redirect.
import { createServerSupabaseClient } from '@/lib/supabase-server'

// ─────────────────────────────────────────────────────────────────────────────
// 'HomePage' is an exported async function (a Next.js Server Component).
// "async" means it can use 'await' to pause and wait for database/API responses.
// It takes no parameters and does not return any JSX — it only calls redirect().
// Next.js automatically uses this as the page served at the "/" URL.
// ─────────────────────────────────────────────────────────────────────────────
export default async function HomePage() {

  // 'supabase' is a constant that holds the server-side Supabase client object.
  // This object has methods for querying the database and checking auth state.
  const supabase = createServerSupabaseClient()

  // 'user' is an object (or null) representing the currently logged-in user.
  // 'supabase.auth.getUser()' is an async function that reads the session from
  // the HTTP request cookies and returns the user's profile, or null if no session exists.
  // The destructuring '{ data: { user } }' unpacks the nested response object
  // to get just the 'user' value directly.
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // 'user' is truthy (not null) — a valid session exists.
    // Redirect the logged-in user to the builder page to start configuring a chat.
    redirect('/builder')
  } else {
    // 'user' is null — no session exists or it has expired.
    // Redirect the anonymous visitor to the login page.
    redirect('/login')
  }
}
