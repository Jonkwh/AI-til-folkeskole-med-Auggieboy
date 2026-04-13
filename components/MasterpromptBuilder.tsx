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
          'teste ideer',
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
        options: ['7. klasse', '8. klasse', '9. klasse'],
      },
      {
        key: 'subject',
        options: ['Dansk', 'Engelsk', 'Matematik', 'Historie', 'Samfundsfag', 'Fysik/kemi', 'Biologi', 'Geografi', 'Kristendomskundskab', 'Tysk', 'Fransk', 'Alle fag'],
      },
    ],
  },
  {
    label: 'BEGRÆNSNING',
    prefix: '',
    color: { bg: '#F5C4B3', border: '#F0997B', text: '#B8432A' },
    dropdowns: [],
  },
]

const RESTRICTION_OPTIONS = [
  { label: 'Brug kun eksempler fra den tekst eller det emne, eleven arbejder med', prompt: 'bruge eksempler fra andre tekster eller emner end dem eleven arbejder med' },
  { label: 'Svar kun på dansk. Skift ikke til et andet sprog, selvom eleven gør det', prompt: 'skifte til et andet sprog end dansk, selvom eleven gør det' },
  { label: 'Giv ikke eksempler fra andre forfattere, film eller tekster end dem eleven selv nævner', prompt: 'give eksempler fra forfattere, film eller tekster som eleven ikke selv har nævnt' },
  { label: 'Brug aldrig fagtermer uden at forklare dem først', prompt: 'bruge fagtermer uden at forklare dem først' },
  { label: 'Hold dig til det emne eller den tekst, eleven nævner i starten, og gå ikke videre til andre emner', prompt: 'gå videre til andre emner end det emne eller den tekst, eleven nævner i starten' },
]

export default function MasterpromptBuilder() {
  const router = useRouter()
  const supabase = createClient()
  const [selections, setSelections] = useState<Record<string, string>>({
    role: BLOCKS[0].dropdowns[0].options[0],
    grade: BLOCKS[1].dropdowns[0].options[0],
    subject: BLOCKS[1].dropdowns[1].options[0],
  })
  const [checkedRestrictions, setCheckedRestrictions] = useState([true, false, false, false, false])
  const [loading, setLoading] = useState(false)

  function handleChange(key: string, value: string) {
    setSelections((prev) => ({ ...prev, [key]: value }))
  }

  function handleRestrictionToggle(index: number) {
    setCheckedRestrictions((prev) => {
      const checkedCount = prev.filter(Boolean).length
      if (prev[index] && checkedCount <= 1) return prev
      const next = [...prev]
      next[index] = !next[index]
      return next
    })
  }

  function buildRestrictionText(): string {
    const selected = RESTRICTION_OPTIONS
      .filter((_, i) => checkedRestrictions[i])
      .map((opt) => opt.prompt)
    if (selected.length === 1) return selected[0]
    return selected.slice(0, -1).join(', ') + ' og ' + selected[selected.length - 1]
  }

  function assemblePrompt(): string {
    const lines = [
      `AI'en skal ${selections.role}`,
      `for elever i ${selections.grade} i ${selections.subject} i en dansk skole`,
      `Aldrig ${buildRestrictionText()}.`,
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

                {block.label === 'BEGRÆNSNING' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
                    {RESTRICTION_OPTIONS.map((opt, i) => (
                      <label
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          fontSize: 13,
                          fontWeight: 400,
                          lineHeight: 1.5,
                          cursor: 'pointer',
                          padding: '4px 8px',
                          borderRadius: 6,
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                      >
                        <span style={{ position: 'relative', width: 16, height: 16, flexShrink: 0 }}>
                          <input
                            type="checkbox"
                            checked={checkedRestrictions[i]}
                            onChange={() => handleRestrictionToggle(i)}
                            style={{ opacity: 0, position: 'absolute', width: 16, height: 16, cursor: 'pointer' }}
                          />
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 16,
                              height: 16,
                              borderRadius: 4,
                              border: checkedRestrictions[i] ? '1.5px solid #D4785A' : '1.5px solid rgba(0,0,0,0.2)',
                              background: checkedRestrictions[i] ? '#F0997B' : 'rgba(255,255,255,0.6)',
                              transition: 'all 0.15s',
                            }}
                          >
                            {checkedRestrictions[i] && (
                              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                <path d="M1 3.5L3.5 6L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                        </span>
                        <span style={{ color: '#1a1a18' }}>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                ) : (
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
                )}
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
                  Aldrig {buildRestrictionText()}
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
