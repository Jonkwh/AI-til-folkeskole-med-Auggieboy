// Imports the server-side Supabase client factory, designed for use in Next.js Server Components and API routes.
import { createServerClient } from '@supabase/ssr'
// Imports the Next.js cookie store so the server can read/write auth session cookies.
import { cookies } from 'next/headers'

// Exported function used by server-side code to get a Supabase connection that reads the user's session from cookies.
export function createServerSupabaseClient() {
  // Accesses the current request's cookie store (only available on the server side).
  const cookieStore = cookies()

  // Creates the Supabase client with a custom cookie adapter so auth tokens are handled server-side.
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, // The URL of your Supabase project
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // The public API key (session is read from the cookie, not exposed)
    {
      cookies: {
        // Reads a specific cookie by name — used by Supabase to retrieve the current user's session token.
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        // Writes a cookie — used by Supabase to store a refreshed session token.
        set(name: string, value: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
        // Deletes a cookie by overwriting it with an empty value — used when the user signs out.
        remove(name: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // The `delete` method was called from a Server Component.
          }
        },
      },
    }
  )
}
