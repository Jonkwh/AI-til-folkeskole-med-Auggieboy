'use client'

import { useState } from 'react'

// Hardcoded teacher password — intentionally simple for prototype use.
// Replace with proper auth in a future iteration.
const TEACHER_PASSWORD = 'Thinkbot2026'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function sevenDaysAgoISO() {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'long',
  })
}

interface Report {
  understood: string
  confusion: string
  nextSteps: string
}

interface ApiResult {
  sessionCount: number
  report: Report | null
  truncated: boolean
  generatedAt: string
}

export default function RapportPage() {
  // ── Auth state ────────────────────────────────────────────────────────
  const [authenticated, setAuthenticated] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState(false)

  // ── Date range state ─────────────────────────────────────────────────
  const [from, setFrom] = useState(sevenDaysAgoISO)
  const [to, setTo] = useState(todayISO)

  // ── Report state ─────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ApiResult | null>(null)
  const [fetchError, setFetchError] = useState('')

  function handleLogin() {
    if (passwordInput === TEACHER_PASSWORD) {
      setAuthenticated(true)
      setPasswordError(false)
    } else {
      setPasswordError(true)
    }
  }

  async function handleGenerate() {
    setFetchError('')
    setResult(null)
    setLoading(true)

    try {
      const res = await fetch('/api/generate-class-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${from}T00:00:00.000Z`,
          to: `${to}T23:59:59.999Z`,
        }),
      })

      if (!res.ok) throw new Error('Server error')

      const data: ApiResult = await res.json()
      setResult(data)
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

function Section({
  title,
  content,
  borderColor,
}: {
  title: string
  content: string
  borderColor: string
}) {
  return (
    <div
      className="px-6 py-5"
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      <p style={{ fontWeight: 500, fontSize: 14 }} className="text-gray-800 mb-2">
        {title}
      </p>
      <p style={{ fontSize: 14, lineHeight: 1.7 }} className="text-gray-600">
        {content}
      </p>
    </div>
  )
}
