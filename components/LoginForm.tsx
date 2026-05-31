// Marks this as a client component because it handles form input and user interaction.
'use client'

// Imports useState to manage form field values and UI state.
import { useState } from 'react'
// Imports useRouter to programmatically navigate after a successful login or sign-up.
import { useRouter } from 'next/navigation'
// Imports the Supabase browser client factory for authentication operations.
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'

// The login and sign-up form — teachers use this to access ThinkBot.
// Toggling between login and sign-up modes is handled by the isSignUp state variable.
export default function LoginForm() {
  const router = useRouter() // Used to redirect to /builder after successful authentication.
  const supabase = createClient() // Browser-side Supabase client for auth calls.
  const { t, toggleLanguage } = useLanguage()
  const [email, setEmail] = useState('') // Tracks the value typed in the email input.
  const [password, setPassword] = useState('') // Tracks the value typed in the password input.
  const [confirmPassword, setConfirmPassword] = useState('') // Tracks the confirmation password, only used during sign-up.
  const [isSignUp, setIsSignUp] = useState(false) // Toggles between login mode (false) and sign-up mode (true).
  const [error, setError] = useState('') // Holds any error message to display below the form.
  const [loading, setLoading] = useState(false) // True while the auth request is in flight — disables the submit button.

  // Handles form submission for both login and sign-up.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault() // Prevents the browser's default full-page form submission.
    setError('')
    setLoading(true)

    // Client-side validation: passwords must match before hitting the Supabase API.
    if (isSignUp && password !== confirmPassword) {
      setError(t('login.error.mismatch'))
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
      const message = err instanceof Error ? err.message : t('login.error.generic')
      setError(message)
    } finally {
      setLoading(false) // Re-enables the submit button regardless of whether the request succeeded or failed.
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)] px-4">
      <div className="w-full max-w-sm">
        {/* Language toggle */}
        <div className="flex justify-end mb-2">
          <button
            onClick={toggleLanguage}
            className="px-3 py-1 rounded-lg text-xs font-medium border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
          >
            {t('lang.toggle')}
          </button>
        </div>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gray-900 flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-xl font-bold">TB</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{t('login.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('login.subtitle')}</p>
        </div>

        {/* Form */}
        <div className="bg-white border border-[#e5e3d9] rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            {isSignUp ? t('login.heading.signup') : t('login.heading.login')}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                {t('login.email')}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent"
                placeholder={t('login.email.placeholder')}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                {t('login.password')}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent"
                placeholder={t('login.password.placeholder')}
              />
            </div>

            {isSignUp && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('login.confirmPassword')}
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent"
                  placeholder={t('login.confirmPassword.placeholder')}
                />
                {confirmPassword && (
                  <p className={`text-sm mt-1 ${password === confirmPassword ? 'text-green-600' : 'text-red-600'}`}>
                    {password === confirmPassword ? t('login.passwordMatch') : t('login.passwordMismatch')}
                  </p>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('login.loading') : isSignUp ? t('login.submit.signup') : t('login.submit.login')}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp)
                setError('')
                setConfirmPassword('')
              }}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              {isSignUp ? t('login.toggle.toLogin') : t('login.toggle.toSignup')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
