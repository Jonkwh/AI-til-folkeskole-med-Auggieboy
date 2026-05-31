/*
 * LoginForm.tsx
 *
 * This file exports the LoginForm component — the authentication screen teachers see when
 * they visit ThinkBot without an active session. It supports both logging in to an existing
 * account and creating a new one, toggling between modes via the isSignUp state variable.
 *
 * Exports:
 *   - default: LoginForm (React functional component)
 *
 * How it fits in the app:
 *   The /login page (or middleware redirect) renders this component full-screen. On
 *   successful authentication — either sign-up or sign-in — the user is redirected to
 *   /builder where they can configure masterprompts and manage chat sessions. Supabase
 *   Auth handles session persistence via HTTP-only cookies managed by the browser client.
 */

// Marks this as a client component because it handles form input and user interaction.
'use client'

// Imports useState to manage form field values and UI state.
import { useState } from 'react'
// Imports useRouter to programmatically navigate after a successful login or sign-up.
import { useRouter } from 'next/navigation'
// Imports the Supabase browser client factory for authentication operations.
import { createClient } from '@/lib/supabase'

/*
 * LoginForm is a function that takes 0 parameters and returns JSX (a React element).
 *
 * It renders a centred card containing the ThinkBot logo, a heading, and a form with
 * email and password fields (plus a confirm-password field in sign-up mode). On submit,
 * handleSubmit performs client-side validation and then calls the appropriate Supabase
 * Auth method. The component also provides a toggle link so the user can switch between
 * login and sign-up modes without navigating away.
 */
// The login and sign-up form — teachers use this to access ThinkBot.
// Toggling between login and sign-up modes is handled by the isSignUp state variable.
export default function LoginForm() {
  // router is a Next.js AppRouter instance — used to redirect to /builder after successful authentication.
  const router = useRouter()
  // supabase is a SupabaseClient instance (browser-side) — used for signUp and signInWithPassword calls.
  const supabase = createClient()
  // email is a string state variable — tracks the value typed in the email input field.
  const [email, setEmail] = useState('')
  // password is a string state variable — tracks the value typed in the password input field.
  const [password, setPassword] = useState('')
  // confirmPassword is a string state variable — tracks the confirmation password field; only relevant in sign-up mode.
  const [confirmPassword, setConfirmPassword] = useState('')
  // isSignUp is a boolean state variable — false means login mode, true means sign-up mode.
  const [isSignUp, setIsSignUp] = useState(false)
  // error is a string state variable — holds any error message shown below the form. Empty string means no error.
  const [error, setError] = useState('')
  // loading is a boolean state variable — true while the Supabase auth request is in flight; disables the submit button.
  const [loading, setLoading] = useState(false)

  /*
   * handleSubmit is a function that takes 1 parameter
   *   (e: React.FormEvent)
   * and returns Promise<void>.
   *
   * Steps:
   *   1. Prevent the browser's default full-page form submission.
   *   2. Clear any previous error and set loading to true.
   *   3. In sign-up mode, validate that password and confirmPassword match; abort with
   *      an error message if they do not.
   *   4. Call either supabase.auth.signUp or supabase.auth.signInWithPassword depending
   *      on the isSignUp flag.
   *   5. On success, redirect to /builder.
   *   6. On failure, extract the error message from the thrown Error and display it.
   *   7. Always set loading back to false in the finally block.
   */
  // Handles form submission for both login and sign-up.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault() // Prevents the browser's default full-page form submission.
    setError('')
    setLoading(true)

    // Client-side validation: passwords must match before hitting the Supabase API.
    if (isSignUp && password !== confirmPassword) {
      setError('Adgangskoderne stemmer ikke overens')
      setLoading(false)
      return
    }

    try {
      if (isSignUp) {
        // Registers a new user with Supabase Auth using the provided email and password.
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        router.push('/builder') // Redirects to the builder page after a successful sign-up.
      } else {
        // Logs in an existing user and establishes an authenticated session via cookie.
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push('/builder') // Redirects to the builder page after a successful login.
      }
    } catch (err: unknown) {
      // Extracts the error message from the Supabase error object and shows it in the form.
      const message = err instanceof Error ? err.message : 'Der opstod en fejl'
      setError(message)
    } finally {
      setLoading(false) // Re-enables the submit button regardless of whether the request succeeded or failed.
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gray-900 flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-xl font-bold">TB</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">ThinkBot</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">AI til kritisk tænkning</p>
        </div>

        {/* Form */}
        <div className="bg-white border border-[#e5e3d9] rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            {isSignUp ? 'Opret en konto' : 'Log ind'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent"
                placeholder="dig@skole.dk"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Adgangskode
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent"
                placeholder="Min. 6 tegn"
              />
            </div>

            {/* The confirm-password field is only shown when the user is in sign-up mode. */}
            {isSignUp && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Gentag adgangskode
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent"
                  placeholder="Gentag din adgangskode"
                />
                {/* Inline match indicator — shown as green when passwords match, red when they do not. */}
                {confirmPassword && (
                  <p className={`text-sm mt-1 ${password === confirmPassword ? 'text-green-600' : 'text-red-600'}`}>
                    {password === confirmPassword ? 'Adgangskoderne matcher' : 'Adgangskoderne stemmer ikke overens'}
                  </p>
                )}
              </div>
            )}

            {/* Error message paragraph — only rendered when the error state variable is non-empty. */}
            {error && (
              <p className="text-sm text-red-600">
                {error}
              </p>
            )}

            {/* Submit button — shows a loading message while the auth request is in flight. */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Vent venligst...' : isSignUp ? 'Opret konto' : 'Log ind'}
            </button>
          </form>

          {/* Mode-toggle link — switches between "Log ind" and "Opret en konto" views. */}
          <div className="mt-4 text-center">
            <button
              onClick={() => {
                // Flips the mode, clears any error message, and resets the confirm-password field.
                setIsSignUp(!isSignUp)
                setError('')
                setConfirmPassword('')
              }}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              {isSignUp ? 'Har du allerede en konto? Log ind' : 'Har du ikke en konto? Opret en'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
