'use client'

import { useState } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ShareButtonProps {
  messages: Message[]
  masterprompt: string
}

export default function ShareButton({ messages, masterprompt }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  async function handleShare() {
    setError(false)
    setLoading(true)

    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, masterprompt }),
      })

      if (!res.ok) throw new Error('Report generation failed')

      const report = await res.text()

      await navigator.clipboard.writeText(report)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleShare}
        disabled={messages.length === 0 || loading}
        className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border)] text-gray-600 dark:text-gray-400 hover:bg-[var(--bg-panel)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg
              className="animate-spin h-3.5 w-3.5 text-gray-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Genererer rapport…
          </span>
        ) : (
          'Del med lærer'
        )}
      </button>

      {/* Toast */}
      {copied && (
        <div className="absolute right-0 top-full mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap shadow-lg animate-fade-in">
          Kopieret til udklipsholder!
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute right-0 top-full mt-2 px-3 py-2 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg whitespace-nowrap shadow-lg">
          Kunne ikke generere rapport. Prøv igen.
        </div>
      )}
    </div>
  )
}
