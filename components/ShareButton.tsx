'use client'

import { useState, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ShareButtonProps {
  messages: Message[]
  masterprompt: string
}

export default function ShareButton({ messages, masterprompt }: ShareButtonProps) {
  const [open, setOpen] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  // Generate the report when the modal opens
  useEffect(() => {
    if (!open) return
    setGenerating(true)
    setError('')
    setSent(false)

    fetch('/api/generate-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, masterprompt }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Report generation failed')
        return res.text()
      })
      .then((text) => setTranscript(text))
      .catch(() => setError('Kunne ikke generere rapport. Prøv igen.'))
      .finally(() => setGenerating(false))
  }, [open, messages, masterprompt])

  async function handleSend() {
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'ThinkBot Samtaleeksport',
          body: transcript,
        }),
      })

      if (!res.ok) throw new Error('Send failed')

      setSent(true)
      setTimeout(() => {
        setOpen(false)
        setSent(false)
      }, 2000)
    } catch {
      setError('Kunne ikke sende email. Prøv igen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={messages.length === 0}
        className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border)] text-gray-600 dark:text-gray-400 hover:bg-[var(--bg-panel)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Del med lærer
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Del samtale med lærer
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-hidden px-5 py-4 flex flex-col gap-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Du kan redigere indholdet inden du sender det til din lærer.
              </p>

              {generating ? (
                <div className="flex-1 flex items-center justify-center py-12">
                  <svg
                    className="animate-spin h-6 w-6 text-gray-400"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="ml-3 text-sm text-gray-500">Genererer rapport…</span>
                </div>
              ) : (
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  className="flex-1 min-h-[300px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-sm text-gray-800 dark:text-gray-200 p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              )}

              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}

              {sent && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  Email sendt til din lærer!
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--border)]">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border)] text-gray-600 dark:text-gray-400 hover:bg-[var(--bg-panel)] transition-colors"
              >
                Annuller
              </button>
              <button
                onClick={handleSend}
                disabled={loading || generating || !transcript.trim() || sent}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-3.5 w-3.5"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sender…
                  </span>
                ) : (
                  'Send til lærer'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
