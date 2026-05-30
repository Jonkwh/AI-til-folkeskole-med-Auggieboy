// Marks this as a client component because it manages form state and interactive report generation.
'use client'

// Imports useState to manage auth state, date range selections, and the fetched report result.
import { useState } from 'react'

// Hardcoded teacher password — intentionally simple for prototype use.
// Replace with proper auth in a future iteration.
const TEACHER_PASSWORD = 'Thinkbot2026'

// Returns today's date as an ISO 8601 date string (e.g. "2026-05-30").
// Used as the default end date for the report date range.
function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// Returns the date 7 days ago as an ISO 8601 date string.
// Used as the default start date so the report covers the last week by default.
function sevenDaysAgoISO() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

// Formats an ISO timestamp into a human-readable Danish time string (e.g. "14:32 18. maj").
// Used to show when the report was generated at the bottom of the page.
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'long',
  })
}

// The three sections returned by the class report API, corresponding to Claude's three-section output.
interface Report {
  understood: string // What students grasped well.
  confusion: string // Where students got stuck or confused.
  nextSteps: string // Topics to address in upcoming lessons.
}

// The full response shape returned by POST /api/generate-class-report.
interface ApiResult {
  sessionCount: number // How many sessions were included in the analysis.
  report: Report | null // Null when sessionCount is 0 (no data to analyse).
  truncated: boolean // True when more than 15 sessions existed and only the newest 15 were used.
  generatedAt: string // ISO timestamp of when the API response was created.
}

// The teacher dashboard for generating class-level reports based on student chat activity.
// Protected by a simple password gate — the dashboard itself is publicly accessible by URL.
export default function RapportPage() {
  // ── Auth state ────────────────────────────────────────────────────────
  const [authenticated, setAuthenticated] = useState(false) // True after the correct password is entered.
  const [passwordInput, setPasswordInput] = useState('') // Tracks the value typed in the password field.
  const [passwordError, setPasswordError] = useState(false) // True after a failed login attempt.

  // ── Date range state ─────────────────────────────────────────────────
  const [from, setFrom] = useState(sevenDaysAgoISO) // The start date for the report period.
  const [to, setTo] = useState(todayISO) // The end date for the report period.

  // ── Report state ─────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false) // True while the report API request is in flight.
  const [result, setResult] = useState<ApiResult | null>(null) // The last successfully fetched report result.
  const [fetchError, setFetchError] = useState('') // Holds an error message if the API request fails.

  // Checks the entered password and either grants access or shows an error message.
  function handleLogin() {
    if (passwordInput === TEACHER_PASSWORD) {
      setAuthenticated(true)
      setPasswordError(false)
    } else {
      setPasswordError(true) // Shows "Forkert adgangskode" below the input.
    }
  }

  // Sends the selected date range to the API and stores the returned report in state.
  async function handleGenerate() {
    setFetchError('')
    setResult(null) // Clears the previous report so the loading state is visible.
    setLoading(true)

    try {
      // Sends the date range as full ISO timestamps with time boundaries to include all sessions on those dates.
      const res = await fetch('/api/generate-class-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${from}T00:00:00.000Z`, // Start of the first day (midnight UTC).
          to: `${to}T23:59:59.999Z`, // End of the last day (one millisecond before midnight UTC).
        }),
      })

      if (!res.ok) throw new Error('Server error')

      const data: ApiResult = await res.json()
      setResult(data) // Stores the report so the UI can render the three section cards.
    } catch {
      setFetchError('Kunne ikke generere rapport. Prøv igen.')
    } finally {
      setLoading(false)
    }
  }

  // ── Password gate ─────────────────────────────────────────────────────
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm bg-white border border-gray-200 rounded-xl shadow-sm p-8 flex flex-col gap-4">
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 500 }} className="text-gray-900">
              Lærerrapport
            </h1>
            <p style={{ fontSize: 13 }} className="text-gray-500 mt-1">
              Indtast adgangskoden for at se klassens rapport.
            </p>
          </div>

          <input
            type="password"
            placeholder="Adgangskode"
            value={passwordInput}
            onChange={(e) => {
              setPasswordInput(e.target.value)
              setPasswordError(false)
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />

          {passwordError && (
            <p style={{ fontSize: 12 }} className="text-red-600">
              Forkert adgangskode.
            </p>
          )}

          <button
            onClick={handleLogin}
            className="w-full bg-gray-900 text-white text-sm font-medium py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Log ind
          </button>
        </div>
      </div>
    )
  }

  // ── Dashboard ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <h1 style={{ fontSize: 22, fontWeight: 600 }} className="text-gray-900">
            Klasserapport
          </h1>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-500 w-6">Fra</label>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-500 w-6">Til</label>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Genererer…' : 'Generer rapport'}
            </button>

            {result && (
              <p className="text-xs text-gray-400 text-right">
                {result.sessionCount} samtaler fundet i perioden
              </p>
            )}
          </div>
        </div>

        {/* Report output area */}
        {loading && (
          <div className="flex items-center gap-3 py-12 justify-center text-gray-500">
            <svg
              className="animate-spin h-5 w-5 text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm">Analyserer samtaler…</span>
          </div>
        )}

        {fetchError && (
          <p className="text-sm text-red-500 py-6 text-center">{fetchError}</p>
        )}

        {!loading && result && result.sessionCount === 0 && (
          <p className="text-sm text-gray-500 py-12 text-center">
            Ingen samtaler fundet i den valgte periode.
          </p>
        )}

        {!loading && result && result.report && (
          <div className="flex flex-col gap-4">
            {result.truncated && (
              <p className="text-xs text-gray-400">
                Bemærk: Rapporten er baseret på de 15 nyeste samtaler i perioden.
              </p>
            )}

            {/* Report card */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <Section
                title="Forstået godt"
                content={result.report.understood}
                borderColor="#5DCAA5"
              />
              <div className="border-t border-gray-100" />
              <Section
                title="Forvirring og udfordringer"
                content={result.report.confusion}
                borderColor="#EF9F27"
              />
              <div className="border-t border-gray-100" />
              <Section
                title="Kan arbejdes videre med"
                content={result.report.nextSteps}
                borderColor="#85B7EB"
              />
            </div>

            <p className="text-xs text-gray-400 text-right">
              Rapport genereret: {formatTime(result.generatedAt)}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Removes Markdown bold markers (**text** and *text*) from Claude's output.
// Claude sometimes adds emphasis even when the system prompt asks for plain text — this cleans it up.
function stripAsterisks(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\*/g, '').trim()
}

// Renders a single section card within the class report — one for each of the three analysis sections.
// The left border colour is passed in to visually distinguish the three sections.
function Section({
  title,
  content,
  borderColor,
}: {
  title: string // The section heading displayed in bold above the paragraph.
  content: string // The AI-generated paragraph text for this section.
  borderColor: string // The hex colour used for the left accent border (green, orange, or blue).
}) {
  return (
    // Left-border accent visually differentiates the three sections without using background colours.
    <div
      className="px-6 py-5"
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      <p style={{ fontWeight: 500, fontSize: 14 }} className="text-gray-800 mb-2">
        {title}
      </p>
      {/* Strips any stray Markdown syntax before rendering the text as plain HTML. */}
      <p style={{ fontSize: 14, lineHeight: 1.7 }} className="text-gray-600">
        {stripAsterisks(content)}
      </p>
    </div>
  )
}
