'use client'

import { useState } from 'react'

// TODO: generate structured PDF report

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

  async function handleShare() {
    const date = new Date().toLocaleDateString('da-DK', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    const conversation = messages
      .map((m) => {
        const label = m.role === 'user' ? '[Elev]' : '[ThinkBot]'
        return `${label}: ${m.content}`
      })
      .join('\n\n')

    const transcript = `--- ThinkBot Samtaleeksport ---
Dato: ${date}

Masterprompt brugt:
${masterprompt}

Samtale:
${conversation}`

    try {
      await navigator.clipboard.writeText(transcript)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      console.error('Failed to copy to clipboard')
    }
  }

  return (
    <div className="relative">
      <button
        onClick={handleShare}
        disabled={messages.length === 0}
        className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Del med lærer
      </button>

      {/* Toast */}
      {copied && (
        <div className="absolute right-0 top-full mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap shadow-lg animate-fade-in">
          Kopieret til udklipsholder!
        </div>
      )}
    </div>
  )
}
