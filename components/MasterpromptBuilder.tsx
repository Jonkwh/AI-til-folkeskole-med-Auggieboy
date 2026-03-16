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
    label: 'ROLLE',
    prefix: 'Du er en ',
    color: { bg: '#CECBF6', border: '#AFA9EC', text: '#5B52C9' },
    dropdowns: [
      {
        key: 'role',
        options: [
          'Sokratisk tutor',
          'Skrivecoach',
          'Kritisk tænkning-guide',
          'Lektiehjælper',
          'Fagspecialist',
        ],
      },
    ],
  },
  {
    label: 'KONTEKST',
    prefix: 'for elever i ',
    suffix: '',
    color: { bg: '#9FE1CB', border: '#5DCAA5', text: '#1D7A55' },
    dropdowns: [
      {
        key: 'grade',
        options: ['8. klasse', '9. klasse', 'Gymnasiet', 'Alle klassetrin'],
      },
      {
        key: 'subject',
        options: ['Dansk', 'Engelsk', 'Matematik', 'Historie', 'Naturfag', 'Alle fag'],
      },
    ],
  },
  {
    label: 'MÅL',
    prefix: 'Dit mål er at ',
    color: { bg: '#B5D4F4', border: '#85B7EB', text: '#2563A8' },
    dropdowns: [
      {
        key: 'goal',
        options: [
          'Udvikle kritisk tænkning',
          'Støtte selvstændig problemløsning',
          'Forklare svære begreber',
          'Give konstruktiv feedback',
        ],
      },
    ],
  },
  {
    label: 'ADFÆRD',
    prefix: 'Altid ',
    color: { bg: '#FAC775', border: '#EF9F27', text: '#8B5A00' },
    dropdowns: [
      {
        key: 'behaviour',
        options: [
          'Stil guidende spørgsmål i stedet for at give direkte svar',
          'Få eleven til at reflektere før du svarer',
          'Opdel komplekse problemer i mindre trin',
          'Anerkend elevens indsats og ræsonnement',
        ],
      },
    ],
  },
  {
    label: 'SPROG',
    prefix: 'Svar på ',
    color: { bg: '#C0DD97', border: '#97C459', text: '#3D6B0F' },
    dropdowns: [
      {
        key: 'language',
        options: [
          'Samme sprog som eleven bruger',
          'Dansk',
          'Engelsk',
          'Simpelt aldersvarende sprog',
        ],
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
    goal: BLOCKS[2].dropdowns[0].options[0],
    behaviour: BLOCKS[3].dropdowns[0].options[0],
    language: BLOCKS[4].dropdowns[0].options[0],
    restriction: BLOCKS[5].dropdowns[0].options[0],
  })
  const [loading, setLoading] = useState(false)

  function handleChange(key: string, value: string) {
    setSelections((prev) => ({ ...prev, [key]: value }))
  }

  function assemblePrompt(): string {
    const lines = [
      `Du er en ${selections.role}`,
      `for elever i ${selections.grade} i ${selections.subject}`,
      `Dit mål er at ${selections.goal.toLowerCase()}.`,
      `Altid ${selections.behaviour.toLowerCase()}.`,
      `Svar på ${selections.language.toLowerCase()}.`,
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
        <h2 className="text-2xl font-semibold text-gray-900 mb-1">Byg din masterprompt</h2>
        <p className="text-sm text-gray-500 mb-6">
          Konfigurer hvordan ThinkBot skal opføre sig i denne chatsession.
        </p>

        <div className="relative space-y-4">
          {/* Vertical connecting line */}
          <div className="absolute left-5 top-8 bottom-8 w-0.5 bg-gray-200 z-0" />

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
                        className="text-sm rounded-lg px-3 py-1.5 bg-white border border-gray-300 text-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-1"
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
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Live Preview */}
      <div className="lg:w-96 flex-shrink-0">
        <div className="sticky top-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Forhåndsvisning</h3>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="space-y-2 text-sm leading-relaxed">
              <p>
                <span
                  className="rounded px-1.5 py-0.5 font-medium"
                  style={{ backgroundColor: BLOCKS[0].color.bg }}
                >
                  Du er en {selections.role}
                </span>
              </p>
              <p>
                <span
                  className="rounded px-1.5 py-0.5 font-medium"
                  style={{ backgroundColor: BLOCKS[1].color.bg }}
                >
                  for elever i {selections.grade} i {selections.subject}
                </span>
              </p>
              <p>
                <span
                  className="rounded px-1.5 py-0.5 font-medium"
                  style={{ backgroundColor: BLOCKS[2].color.bg }}
                >
                  Dit mål er at {selections.goal.toLowerCase()}
                </span>
              </p>
              <p>
                <span
                  className="rounded px-1.5 py-0.5 font-medium"
                  style={{ backgroundColor: BLOCKS[3].color.bg }}
                >
                  Altid {selections.behaviour.toLowerCase()}
                </span>
              </p>
              <p>
                <span
                  className="rounded px-1.5 py-0.5 font-medium"
                  style={{ backgroundColor: BLOCKS[4].color.bg }}
                >
                  Svar på {selections.language.toLowerCase()}
                </span>
              </p>
              <p>
                <span
                  className="rounded px-1.5 py-0.5 font-medium"
                  style={{ backgroundColor: BLOCKS[5].color.bg }}
                >
                  Aldrig {selections.restriction.toLowerCase()}
                </span>
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
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
