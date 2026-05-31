// ─────────────────────────────────────────────────────────────────────────────
// MODULE: app/rapport/page.tsx
// PURPOSE: The teacher's class-report dashboard, served at the URL "/rapport".
//          It is protected by a simple password gate — anyone who knows the URL
//          must enter the teacher password before seeing any data. Once authenticated,
//          the teacher selects a date range and clicks a button to generate an
//          AI-written pedagogical analysis of all student conversations in that period.
//          The report is rendered as three colour-coded cards (understood, confused, next steps).
//
// This is a client component because it manages interactive state (password gate,
// date inputs, the report result). There is no server-side auth check here — the
// password gate is UI-only and intentional for this prototype stage.
// ─────────────────────────────────────────────────────────────────────────────

// Marks this file as a client component — required because it uses useState and event handlers.
'use client'

// Imports 'useState', a React hook (a special function) that creates a reactive variable.
// When a state variable changes, React automatically re-renders the component.
import { useState } from 'react'

// 'TEACHER_PASSWORD' is a string constant — the hardcoded password for the teacher dashboard.
// Intentionally simple for the prototype. In a production system this would be replaced
// by proper authentication (e.g. Supabase Auth with a teacher role).
const TEACHER_PASSWORD = 'Thinkbot2026'

// ─────────────────────────────────────────────────────────────────────────────
// DATE HELPER FUNCTIONS
// These three functions are defined outside the component because they do not
// depend on any component state — they can be computed once and reused.
// ─────────────────────────────────────────────────────────────────────────────

// 'todayISO' is a function that takes no parameters and returns a string.
// It returns today's date in ISO 8601 format (e.g. "2026-05-31").
// Used as the default end date so the report range always ends today.
// '.toISOString()' returns a full timestamp like "2026-05-31T10:30:00.000Z";
// '.slice(0, 10)' trims it to just the date portion "2026-05-31".
function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// 'sevenDaysAgoISO' is a function that takes no parameters and returns a string.
// It returns the date 7 days ago in ISO 8601 format.
// Used as the default start date so the report covers the past week by default.
// 'd.setDate(d.getDate() - 7)' subtracts 7 from the current day number — JavaScript
// automatically handles month and year rollovers (e.g. going back across April → March).
function sevenDaysAgoISO() {
  const d = new Date() // 'd' is a Date object representing right now.
  d.setDate(d.getDate() - 7) // Mutates 'd' in place by subtracting 7 days.
  return d.toISOString().slice(0, 10) // Returns the date-only string.
}

// 'formatTime' is a function that takes one parameter:
//   - 'iso' (string): an ISO 8601 timestamp like "2026-05-31T10:30:00.000Z"
// It returns a string: a human-readable Danish date+time like "10:32 31. maj".
// Used to show when the report was generated at the bottom of the page.
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('da-DK', {
    hour: '2-digit',   // Shows hours as two digits (e.g. "10")
    minute: '2-digit', // Shows minutes as two digits (e.g. "32")
    day: 'numeric',    // Shows the day number (e.g. "31.")
    month: 'long',     // Shows the full month name (e.g. "maj")
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPESCRIPT INTERFACES (type definitions)
// Interfaces describe the shape of objects — they are not functions or variables,
// they are compile-time contracts that catch mistakes if the wrong shape is used.
// ─────────────────────────────────────────────────────────────────────────────

// 'Report' is a TypeScript interface — it defines an object type with three string properties.
// Each property holds the text for one section of the class report.
interface Report {
  understood: string // String: Claude's analysis of what students understood well.
  confusion: string  // String: Claude's analysis of where students were confused.
  nextSteps: string  // String: Claude's recommendations for topics to revisit in class.
}

// 'ApiResult' is a TypeScript interface — it defines the full JSON response shape
// returned by POST /api/generate-class-report. All four properties must be present.
interface ApiResult {
  sessionCount: number    // Number: how many sessions were analysed.
  report: Report | null   // Object or null: the three-section report (null if no sessions were found).
  truncated: boolean      // Boolean: true if more than 15 sessions existed and only 15 were used.
  generatedAt: string     // String: ISO timestamp of when the report was generated.
}

// ─────────────────────────────────────────────────────────────────────────────
// 'RapportPage' is an exported function (a React client component).
// It takes no parameters. It returns JSX: either the password gate (if not authenticated)
// or the full report dashboard (if authenticated).
//
// STATE VARIABLES (all managed with useState):
//   Auth:   authenticated (boolean), passwordInput (string), passwordError (boolean)
//   Dates:  from (string), to (string)
//   Report: loading (boolean), result (ApiResult | null), fetchError (string)
// ─────────────────────────────────────────────────────────────────────────────
export default function RapportPage() {

  // ── Auth state ─────────────────────────────────────────────────────────────
  // 'authenticated' is a boolean state variable — false until the correct password is entered.
  // When true, the password gate disappears and the dashboard is rendered instead.
  const [authenticated, setAuthenticated] = useState(false)

  // 'passwordInput' is a string state variable — tracks the current value typed in the password input.
  const [passwordInput, setPasswordInput] = useState('')

  // 'passwordError' is a boolean state variable — true after a failed login attempt.
  // When true, the "Forkert adgangskode" error message is shown below the input.
  const [passwordError, setPasswordError] = useState(false)

  // ── Date range state ────────────────────────────────────────────────────────
  // 'from' is a string state variable — the start date of the report period (ISO date string, e.g. "2026-05-24").
  // Initialised by calling sevenDaysAgoISO() (note: passing the function, not its return value,
  // is a React lazy initialiser pattern that avoids calling the function on every re-render).
  const [from, setFrom] = useState(sevenDaysAgoISO)

  // 'to' is a string state variable — the end date of the report period.
  // Initialised to today's date.
  const [to, setTo] = useState(todayISO)

  // ── Report state ────────────────────────────────────────────────────────────
  // 'loading' is a boolean state variable — true while the API request is in flight.
  // When true, the "Genererer…" spinner is shown and the button is disabled.
  const [loading, setLoading] = useState(false)

  // 'result' is a state variable of type ApiResult or null.
  // Null means no report has been fetched yet. Set to the API response after a successful fetch.
  const [result, setResult] = useState<ApiResult | null>(null)

  // 'fetchError' is a string state variable — holds an error message to show if the API call fails.
  // Empty string means no error.
  const [fetchError, setFetchError] = useState('')

  // ─────────────────────────────────────────────────────────────────────────
  // 'handleLogin' is a function that takes no parameters and has no return value.
  // It compares the entered password against the hardcoded constant and either
  // grants access (sets authenticated to true) or shows an error (sets passwordError to true).
  // ─────────────────────────────────────────────────────────────────────────
  function handleLogin() {
    if (passwordInput === TEACHER_PASSWORD) {
      setAuthenticated(true)  // Boolean → true: hides the password gate, shows the dashboard.
      setPasswordError(false) // Boolean → false: clears any previous error message.
    } else {
      setPasswordError(true)  // Boolean → true: shows the "Forkert adgangskode" message.
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 'handleGenerate' is an async function that takes no parameters and has no return value.
  // It sends the selected date range to the API and stores the returned report.
  //
  // ALGORITHM:
  //   1. Clear any previous error and result, set loading to true.
  //   2. POST the from/to dates (as full ISO timestamps) to /api/generate-class-report.
  //   3. On success: parse the JSON response and store it in 'result'.
  //   4. On failure: store an error message in 'fetchError'.
  //   5. Always: set loading to false when done.
  // ─────────────────────────────────────────────────────────────────────────
  async function handleGenerate() {
    setFetchError('')   // Clears any error from a previous attempt.
    setResult(null)     // Clears the previous report so the loading spinner is visible.
    setLoading(true)    // Boolean → true: shows the spinner and disables the button.

    try {
      // 'res' is a Response object — the HTTP response from the API.
      // The dates are converted from "YYYY-MM-DD" to full ISO timestamps with time boundaries
      // so the database query includes all sessions created on those days (in UTC).
      const res = await fetch('/api/generate-class-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${from}T00:00:00.000Z`, // String: start of the first day at midnight UTC.
          to: `${to}T23:59:59.999Z`,     // String: end of the last day — one millisecond before midnight UTC.
        }),
      })

      if (!res.ok) throw new Error('Server error') // Throws if the HTTP status is 4xx or 5xx.

      // 'data' is a constant of type ApiResult — the parsed JSON response body.
      const data: ApiResult = await res.json()
      setResult(data) // Stores the report result so the UI can render the three section cards.

    } catch {
      setFetchError('Kunne ikke generere rapport. Prøv igen.') // Stores the error string for display.
    } finally {
      setLoading(false) // Boolean → false: always re-enables the button and hides the spinner.
    }
  }

  // ── Password gate ───────────────────────────────────────────────────────────
  // If 'authenticated' is false, render only the password form — nothing else is visible.
  // This is a conditional early return: the function exits here with the gate UI,
  // and the dashboard JSX below is never reached.
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

          {/* Password input: controlled by 'passwordInput' state.
              Pressing Enter calls handleLogin() directly so teachers don't need to click the button. */}
          <input
            type="password"
            placeholder="Adgangskode"
            value={passwordInput}
            onChange={(e) => {
              setPasswordInput(e.target.value) // Updates 'passwordInput' string state on each keystroke.
              setPasswordError(false)           // Clears the error message while the teacher is retyping.
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()} // Calls handleLogin() when Enter is pressed.
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
          />

          {/* Conditional error message — only rendered when 'passwordError' is true. */}
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

  // ── Dashboard (authenticated view) ─────────────────────────────────────────
  // Rendered only when 'authenticated' is true. Shows the date range pickers,
  // the generate button, and (when available) the three-section report cards.
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* Page header: title on the left, date pickers + generate button on the right. */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
          <h1 style={{ fontSize: 22, fontWeight: 600 }} className="text-gray-900">
            Klasserapport
          </h1>

          <div className="flex flex-col gap-3">
            {/* "Fra" date picker — controls the 'from' string state variable.
                'max={to}' prevents the teacher from selecting a start date after the end date. */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-500 w-6">Fra</label>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)} // Updates 'from' string state on change.
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>

            {/* "Til" date picker — controls the 'to' string state variable.
                'min={from}' prevents selecting an end date before the start date. */}
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-500 w-6">Til</label>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)} // Updates 'to' string state on change.
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            </div>

            {/* Generate button — disabled while 'loading' is true to prevent double-submitting. */}
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {/* Ternary: shows "Genererer…" while loading, "Generer rapport" otherwise. */}
              {loading ? 'Genererer…' : 'Generer rapport'}
            </button>

            {/* Session count — only shown after a successful fetch. */}
            {result && (
              <p className="text-xs text-gray-400 text-right">
                {result.sessionCount} samtaler fundet i perioden
              </p>
            )}
          </div>
        </div>

        {/* Loading spinner — only shown while 'loading' is true. */}
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

        {/* Error message — only shown when 'fetchError' is a non-empty string. */}
        {fetchError && (
          <p className="text-sm text-red-500 py-6 text-center">{fetchError}</p>
        )}

        {/* Empty state — shown when the API returned 0 sessions for the selected period. */}
        {!loading && result && result.sessionCount === 0 && (
          <p className="text-sm text-gray-500 py-12 text-center">
            Ingen samtaler fundet i den valgte periode.
          </p>
        )}

        {/* Report cards — only shown when not loading and the API returned a non-null report. */}
        {!loading && result && result.report && (
          <div className="flex flex-col gap-4">

            {/* Truncation disclaimer — shown when 'result.truncated' is true (boolean). */}
            {result.truncated && (
              <p className="text-xs text-gray-400">
                Bemærk: Rapporten er baseret på de 15 nyeste samtaler i perioden.
              </p>
            )}

            {/* The three section cards, rendered using the Section helper component below.
                Each card has a different 'borderColor' string to visually distinguish them. */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <Section title="Forstået godt"           content={result.report.understood} borderColor="#5DCAA5" />
              <div className="border-t border-gray-100" />
              <Section title="Forvirring og udfordringer" content={result.report.confusion}  borderColor="#EF9F27" />
              <div className="border-t border-gray-100" />
              <Section title="Kan arbejdes videre med"  content={result.report.nextSteps}  borderColor="#85B7EB" />
            </div>

            {/* Timestamp showing when the report was generated — formatted by formatTime(). */}
            <p className="text-xs text-gray-400 text-right">
              Rapport genereret: {formatTime(result.generatedAt)}
            </p>
          </div>
        )}

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS (defined outside the component — no access to state needed)
// ─────────────────────────────────────────────────────────────────────────────

// 'stripAsterisks' is a function that takes one parameter:
//   - 'text' (string): a string that may contain Markdown bold markers (**) or italic markers (*)
// It returns a string: the same text with all asterisks removed and whitespace trimmed.
// Claude occasionally adds Markdown emphasis despite being told not to — this cleans it up
// before rendering so the teacher sees plain text rather than raw asterisks.
function stripAsterisks(text: string): string {
  return text.replace(/\*\*/g, '').replace(/\*/g, '').trim()
  // '.replace(/\*\*/g, '')' removes all double-asterisk sequences (bold markers).
  // '.replace(/\*/g, '')' removes any remaining single asterisks (italic markers).
  // 'g' in the regex means "global" — replace ALL occurrences, not just the first.
}

// 'Section' is a function (a React component) that takes three parameters grouped as an object:
//   - 'title' (string): the section heading shown in bold (e.g. "Forstået godt")
//   - 'content' (string): the AI-generated paragraph text for this section
//   - 'borderColor' (string): a hex colour string for the left accent border (e.g. "#5DCAA5")
// It returns JSX: a styled card section with a coloured left border, a bold title, and the content paragraph.
// Called three times in RapportPage — once for each report section.
function Section({
  title,
  content,
  borderColor,
}: {
  title: string       // String: the section heading.
  content: string     // String: the AI-generated paragraph.
  borderColor: string // String: the hex colour for the left accent border.
}) {
  return (
    // The left border colour is applied via inline style so it can be dynamic (from the 'borderColor' parameter).
    <div
      className="px-6 py-5"
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      {/* Section title in semi-bold at 14px. */}
      <p style={{ fontWeight: 500, fontSize: 14 }} className="text-gray-800 mb-2">
        {title}
      </p>
      {/* Section content — stripAsterisks() removes any Markdown formatting before rendering. */}
      <p style={{ fontSize: 14, lineHeight: 1.7 }} className="text-gray-600">
        {stripAsterisks(content)}
      </p>
    </div>
  )
}
