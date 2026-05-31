// ─────────────────────────────────────────────────────────────────────────────
// MODULE: lib/supabase-server.ts
// PURPOSE: Creates and exports a Supabase database client for use on the server
//          side only (Next.js Server Components and API routes). Unlike the browser
//          client in lib/supabase.ts, this version reads the user's auth session
//          from HTTP cookies rather than browser storage, which is the only way to
//          verify identity on the server before sending any HTML to the browser.
// USED BY: app/page.tsx, app/builder/page.tsx, app/chat/[sessionId]/page.tsx
//          (any server component that needs to check if the user is logged in).
// ─────────────────────────────────────────────────────────────────────────────

// Imports the server-side Supabase client factory from '@supabase/ssr'.
// 'createServerClient' is a function that, unlike the browser version, requires a
// custom cookie adapter so it can read and write auth tokens from the HTTP request.
import { createServerClient } from '@supabase/ssr'

// Imports 'cookies' from Next.js — a function that provides access to the current
// HTTP request's cookie store. Only available during a server-side request lifecycle.
import { cookies } from 'next/headers'

// 'createServerSupabaseClient' is an exported function that takes no parameters and
// returns a Supabase client object configured to authenticate via HTTP cookies.
// This function must be called fresh on each server request — it cannot be cached
// at module level because each request has its own cookie store.
export function createServerSupabaseClient() {
  // 'cookieStore' is a constant that holds a reference to the current request's
  // cookie store object. It provides get/set/remove methods for individual cookies.
  const cookieStore = cookies()

  // 'createServerClient' is a function that accepts three parameters:
  //   1. The Supabase project URL (a string)
  //   2. The anonymous API key (a string)
  //   3. A configuration object containing a 'cookies' adapter with three methods
  // It returns a Supabase client object identical in API to the browser version,
  // but wired to read auth tokens from cookies instead of localStorage.
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, // String environment variable: the URL of your Supabase project
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // String environment variable: the public API key
    {
      // The 'cookies' object provides three functions that Supabase calls internally
      // to read, write, and delete the user's auth session token from HTTP cookies.
      cookies: {

        // 'get' is a function that takes one string parameter ('name', the cookie name)
        // and returns a string (the cookie's value) or undefined if the cookie doesn't exist.
        // Supabase calls this to retrieve the current user's session token.
        get(name: string) {
          return cookieStore.get(name)?.value // The '?.' safely returns undefined if the cookie is missing.
        },

        // 'set' is a function that takes three parameters:
        //   - 'name' (string): the cookie name
        //   - 'value' (string): the new cookie value (the refreshed session token)
        //   - 'options' (object): settings like expiry time, secure flag, path, etc.
        // Supabase calls this to save a refreshed auth token after a session renewal.
        // The try/catch is needed because calling 'set' from a Server Component throws
        // a read-only error — it can only succeed from a Route Handler or middleware.
        set(name: string, value: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value, ...options }) // Spreads the options object into the cookie settings.
          } catch {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },

        // 'remove' is a function that takes two parameters:
        //   - 'name' (string): the cookie name to delete
        //   - 'options' (object): settings applied to the deletion (e.g. path, domain)
        // Supabase calls this when the user signs out to erase the session token.
        // Cookies cannot truly be deleted server-side — they are overwritten with an empty value instead.
        remove(name: string, options: Record<string, unknown>) {
          try {
            cookieStore.set({ name, value: '', ...options }) // Sets the cookie value to an empty string, effectively invalidating it.
          } catch {
            // The `delete` method was called from a Server Component.
          }
        },
      },
    }
  )
}
