'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface BlockConfig {
  label: string
  prefix: string
  suffix?: string
  color: { bg: string; border: string; text: string }
  dropdowns: {
    key: string
    options: string[]
  }[]
}

const BLOCKS: BlockConfig[] = [
  {
    label: "AI'EN SKAL",
    prefix: "AI'en skal ",
    color: { bg: '#CECBF6', border: '#AFA9EC', text: '#5B52C9' },
    dropdowns: [
      {
        key: 'role',
        options: [
          'hjælpe med at forstå opgaven',
          'give tekstideer',
          'komme med ideer',
          'give feedback på min tekst',
          'hjælpe med at læse op til eksamen',
          'hjælpe med datavisualisering',
        ],
      },
    ],
  },
  {
    label: 'KONTEKST',
    prefix: 'for elever i ',
    suffix: ' i en dansk skole',
    color: { bg: '#9FE1CB', border: '#5DCAA5', text: '#1D7A55' },
    dropdowns: [
      {
        key: 'grade',
        options: ['8. klasse', '9. klasse', 'Gymnasiet', 'Alle klassetrin'],
      },
      {
        key: 'subject',
        options: ['Dansk', 'Engelsk', 'Matematik', 'Historie', 'Samfundsfag', 'Naturfag', 'Alle fag'],
      },
    ],
  },
  {
    label: 'BEGRÆNSNING',
    prefix: 'Aldrig ',
    color: { bg: '#F5C4B3', border: '#F0997B', text: '#B8432A' },
    dropdowns: [
      {
        key: 'restriction',
        options: [
          'Skriv opgaver eller stile på vegne af eleven',
          'Afslør svaret uden at eleven har prøvet selv først',
          'Giv information uden at angive kilder',
          'Brug sprog som eleven ikke selv kunne have skrevet',
        ],
      },
    ],
  },
]

export default function MasterpromptBuilder() {
  const router = useRouter()
  const supabase = createClient()
  const [selections, setSelections] = useState<Record<string, string>>({
    role: BLOCKS[0].dropdowns[0].options[0],
    grade: BLOCKS[1].dropdowns[0].options[0],
    subject: BLOCKS[1].dropdowns[1].options[0],
    restriction: BLOCKS[2].dropdowns[0].options[0],
  })
  const [loading, setLoading] = useState(false)

  function handleChange(key: string, value: string) {
    setSelections((prev) => ({ ...prev, [key]: value }))
  }

  function assemblePrompt(): string {
    const lines = [
      `AI'en skal ${selections.role}`,
      `for elever i ${selections.grade} i ${selections.subject} i en dansk skole`,
      `Aldrig ${selections.restriction.toLowerCase()}.`,
    ]
    return lines.join('. \n')
  }

  function estimateTokens(text: string): number {
    const words = text.split(/\s+/).length
    return Math.round(words * 1.3)
  }

  async function handleStartChat() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const masterprompt = assemblePrompt()
      const { data: session, error } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          title: 'Ny chat',
          masterprompt,
        })
        .select()
        .single()

      if (error) throw error
      router.push(`/chat/${session.id}`)
    } catch (err) {
      console.error('Failed to create chat session:', err)
    } finally {
      setLoading(false)
    }
  }

  const prompt = assemblePrompt()
  const tokenCount = estimateTokens(prompt)

  return (
    <div className="flex flex-col lg:flex-row gap-8 w-full max-w-6xl mx-auto p-6">
      {/* Left: Block Builder */}
      <div className="flex-1 min-w-0">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">Byg din masterprompt</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Konfigurer hvordan ThinkBot skal opføre sig i denne chatsession.
        </p>

        <div className="relative space-y-4">
          {/* Vertical connecting line */}
          <div className="absolute left-5 top-8 bottom-8 w-0.5 bg-[var(--border)] z-0" />

          {BLOCKS.map((block, index) => (
            <div key={block.label} className="relative z-10">
              <div
                className="rounded-xl p-4 border-2"
                style={{
                  backgroundColor: block.color.bg,
                  borderColor: block.color.border,
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: block.color.border }}
                  >
                    {index + 1}
                  </div>
                  <span
                    className="text-xs font-bold uppercase tracking-wider"
                    style={{ color: block.color.text }}
                  >
                    {block.label}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{block.prefix}</span>
                  {block.dropdowns.map((dropdown, dIdx) => (
                    <span key={dropdown.key} className="flex items-center gap-2">
                      {dIdx > 0 && (
                        <span className="text-sm text-gray-600">
                          {block.label === 'KONTEKST' ? 'i' : ''}
                        </span>
                      )}
                      <select
                        value={selections[dropdown.key]}
                        onChange={(e) => handleChange(dropdown.key, e.target.value)}
                        className="text-sm rounded-lg px-3 py-1.5 bg-white dark:bg-[#3e3e42] border border-gray-300 dark:border-[#3e3e42] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-1"
                        style={{ focusRingColor: block.color.border } as React.CSSProperties}
                      >
                        {dropdown.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </span>
                  ))}
                  {block.suffix && (
                    <span className="text-sm font-medium text-gray-800">{block.suffix}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Live Preview */}
      <div className="lg:w-96 flex-shrink-0">
        <div className="sticky top-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Forhåndsvisning</h3>
          <div className="rounded-xl border border-[var(--border)] bg-white dark:bg-[#2d2d30] p-5 shadow-sm">
            <div className="space-y-2 text-sm leading-relaxed">
              <p>
                <span
                  className="rounded px-1.5 py-0.5 font-medium"
                  style={{ backgroundColor: BLOCKS[0].color.bg }}
                >
                  AI&apos;en skal {selections.role}
                </span>
              </p>
              <p>
                <span
                  className="rounded px-1.5 py-0.5 font-medium"
                  style={{ backgroundColor: BLOCKS[1].color.bg }}
                >
                  for elever i {selections.grade} i {selections.subject} i en dansk skole
                </span>
              </p>
              <p>
                <span
                  className="rounded px-1.5 py-0.5 font-medium"
                  style={{ backgroundColor: BLOCKS[2].color.bg }}
                >
                  Aldrig {selections.restriction.toLowerCase()}
                </span>
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between">
              <span className="text-xs text-gray-400">
                ~{tokenCount} tokens
              </span>
            </div>
          </div>

          <button
            onClick={handleStartChat}
            disabled={loading}
            className="mt-4 w-full py-3 px-6 rounded-xl bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Opretter session...' : 'Start chat →'}
          </button>
        </div>
      </div>
    </div>
  )
}
