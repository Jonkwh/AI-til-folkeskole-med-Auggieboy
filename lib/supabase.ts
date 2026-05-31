// ─────────────────────────────────────────────────────────────────────────────
// MODULE: lib/supabase.ts
// PURPOSE: Creates and exports a Supabase database client for use in browser-side
//          (client) components. This module is the single place where the client-side
//          database connection is configured, so changing the URL or key here affects
//          every component that imports it.
// USED BY: Any React component marked 'use client' that needs to read from or write
//          to the Supabase database (e.g. ChatInterface, LoginForm, Sidebar).
// ─────────────────────────────────────────────────────────────────────────────

// Imports the browser-side Supabase client factory from the '@supabase/ssr' package.
// 'createBrowserClient' is a function provided by the Supabase SSR library specifically
// designed for use in browser environments where auth tokens are stored in cookies.
import { createBrowserClient } from '@supabase/ssr'

// 'createClient' is an exported function that takes no parameters and returns a
// fully configured Supabase client object. Calling this function gives the component
// access to the database, authentication, and storage APIs.
// The '!' after each environment variable is a TypeScript non-null assertion — it tells
// TypeScript "I guarantee this variable is defined at runtime; don't warn me if it looks optional."
export function createClient() {
  // 'createBrowserClient' is a function imported above that accepts two string parameters:
  //   1. The Supabase project URL (a string like "https://xyz.supabase.co")
  //   2. The anonymous API key (a long string that grants limited, public read access)
  // It returns a Supabase client object with methods like .from(), .auth.getUser(), etc.
  // NEXT_PUBLIC_ variables are safe to expose to the browser — they are intentionally public.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, // String environment variable: the URL of your Supabase project
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // String environment variable: the public anonymous API key (read-only access by default)
  )
}
