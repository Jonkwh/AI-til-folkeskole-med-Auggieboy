// Imports the browser-side Supabase client factory from the SSR helper package.
import { createBrowserClient } from '@supabase/ssr'

// Exported function used by client components to get a Supabase connection.
// The '!' tells TypeScript to trust that these environment variables are set.
export function createClient() {
  // Creates and returns a Supabase client configured for use in the browser.
  // NEXT_PUBLIC_ variables are safe to expose to the client; they are the public URL and anonymous key.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, // The URL of your Supabase project
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // The public anonymous API key (read-only access by default)
  )
}
