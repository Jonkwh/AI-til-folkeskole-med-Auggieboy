// Marks this as a client component so it can manage form state and respond to user interactions.
'use client'

// Imports useState to track the currently selected dropdown values and checked restriction options.
import { useState } from 'react'
// Imports useRouter to navigate to the newly created chat session after the teacher clicks "Start chat".
import { useRouter } from 'next/navigation'
// Imports the browser-side Supabase client to create a new chat session in the database.
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'

// Describes the configuration shape for each of the three building blocks (Role, Context, Restriction).
interface BlockConfig {
  label: string // The block's display label, shown in uppercase above the block (e.g. "AI'EN SKAL").
  prefix: string // Static text displayed before the dropdown(s) within the block.
  suffix?: string // Optional static text displayed after the dropdown(s) (e.g. " i en dansk skole").
  color: { bg: string; border: string; text: string } // The colour scheme for this block's card.
  dropdowns: { // The dropdown(s) inside this block — may be empty (Restriction block uses checkboxes instead).
    key: string
    options: string[]
  }[]
}

// Defines the three building blocks rendered in the masterprompt builder.
// Each block contributes one line to the assembled masterprompt text.
const BLOCKS: BlockConfig[] = [
  {
    label: "AI'EN SKAL", // Block 1: the bot's role (what it helps the student with).
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
    label: 'KONTEKST', // Block 2: the student's grade and subject.
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
    label: 'BEGRÆNSNING', // Block 3: what the bot must never do — uses checkboxes instead of dropdowns.
    prefix: '',
    color: { bg: '#F5C4B3', border: '#F0997B', text: '#B8432A' },
    dropdowns: [], // No dropdowns — this block is handled by the RESTRICTION_OPTIONS checkboxes below.
  },
]

// The available restriction rules teachers can apply. Each entry has:
// - label: the human-readable description shown in the UI checkbox.
// - prompt: the machine-readable phrase inserted into the "Aldrig ..." line of the masterprompt.
const RESTRICTION_OPTIONS = [
  { label: 'Brug kun eksempler fra den tekst eller det emne, eleven arbejder med', prompt: 'bruge eksempler fra andre tekster eller emner end dem eleven arbejder med' },
  { label: 'Svar kun på dansk. Skift ikke til et andet sprog, selvom eleven gør det', prompt: 'skifte til et andet sprog end dansk, selvom eleven gør det' },
  { label: 'Giv ikke eksempler fra andre forfattere, film eller tekster end dem eleven selv nævner', prompt: 'give eksempler fra forfattere, film eller tekster som eleven ikke selv har nævnt' },
  { label: 'Brug aldrig fagtermer uden at forklare dem først', prompt: 'bruge fagtermer uden at forklare dem først' },
  { label: 'Hold dig til det emne eller den tekst, eleven nævner i starten, og gå ikke videre til andre emner', prompt: 'gå videre til andre emner end det emne eller den tekst, eleven nævner i starten' },
]

// The masterprompt builder form. Teachers configure the bot's role, context, and restrictions,
// then click "Start chat" to create a new session and navigate to it.
export default function MasterpromptBuilder() {
  const router = useRouter()
  const supabase = createClient()
  const { t, tValue } = useLanguage()
  // Tracks the currently selected value for each dropdown (role, grade, subject).
  // Initialised to the first option in each list so the preview is always populated.
  const [selections, setSelections] = useState<Record<string, string>>({
    role: BLOCKS[0].dropdowns[0].options[0],
    grade: BLOCKS[1].dropdowns[0].options[0],
    subject: BLOCKS[1].dropdowns[1].options[0],
  })
  // Tracks which restriction checkboxes are checked. The first restriction is checked by default.
  const [checkedRestrictions, setCheckedRestrictions] = useState([true, false, false, false, false])
  // True while the session creation request is in flight — disables the "Start chat" button.
  const [loading, setLoading] = useState(false)

  // Updates the stored selection when the user changes a dropdown value.
  function handleChange(key: string, value: string) {
    setSelections((prev) => ({ ...prev, [key]: value }))
  }

  // Toggles a restriction checkbox. At least one restriction must always remain checked —
  // the function returns early without changes if the user tries to uncheck the last active restriction.
  function handleRestrictionToggle(index: number) {
    setCheckedRestrictions((prev) => {
      const checkedCount = prev.filter(Boolean).length
      if (prev[index] && checkedCount <= 1) return prev // Prevents all restrictions from being unchecked.
      const next = [...prev]
      next[index] = !next[index] // Flips the checkbox at the given index.
      return next
    })
  }

  // Builds the restriction text for the "Aldrig ..." line by joining all checked restriction prompts.
  // Multiple restrictions are joined with commas and "og" (e.g. "A, B og C").
  function buildRestrictionText(): string {
    const selected = RESTRICTION_OPTIONS
      .filter((_, i) => checkedRestrictions[i]) // Keeps only checked restrictions.
      .map((opt) => opt.prompt) // Uses the machine-readable prompt phrase, not the UI label.
    if (selected.length === 1) return selected[0]
    return selected.slice(0, -1).join(', ') + ' og ' + selected[selected.length - 1]
  }

  // Assembles the complete masterprompt string from the current selections and restrictions.
  // The output is the exact text stored in the database and sent to Claude as the system prompt.
  function assemblePrompt(): string {
    const lines = [
      `AI'en skal ${selections.role}`,
      `for elever i ${selections.grade} i ${selections.subject} i en dansk skole`,
      `Aldrig ${buildRestrictionText()}.`,
    ]
    return lines.join('. \n') // Each line is separated by ". \n" to form a readable multi-line instruction.
  }

  // Provides a rough token estimate for the assembled prompt.
  // Words × 1.3 is a common approximation for English/Danish text (some words split into multiple tokens).
  function estimateTokens(text: string): number {
    const words = text.split(/\s+/).length
    return Math.round(words * 1.3)
  }

  // Creates a new chat session in Supabase with the assembled masterprompt, then navigates to it.
  async function handleStartChat() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // Redirects to login if the session has expired — shouldn't normally happen on this page.
        router.push('/login')
        return
      }

      const masterprompt = assemblePrompt() // Captures the current prompt before navigating away.
      // Inserts a new row into chat_sessions and returns the created row so we can read its generated ID.
      const { data: session, error } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          title: 'Ny chat', // Placeholder title — updated automatically after the first student message.
          masterprompt,
        })
        .select()
        .single()

      if (error) throw error
      router.push(`/chat/${session.id}`) // Navigates to the newly created session.
    } catch (err) {
      console.error('Failed to create chat session:', err)
    } finally {
      setLoading(false)
    }
  }

  const prompt = assemblePrompt() // Used for the live preview and the token estimate shown in the UI.
  const tokenCount = estimateTokens(prompt)

  return (
    <div className="flex flex-col lg:flex-row gap-8 w-full max-w-6xl mx-auto p-6">
      {/* Left: Block Builder */}
      <div className="flex-1 min-w-0">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">{t('builder.title')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {t('builder.subtitle')}
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
                    {block.label === "AI'EN SKAL" ? t('builder.block.aiShall') : block.label === 'KONTEKST' ? t('builder.block.context') : t('builder.block.restriction')}
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
                        <span style={{ color: '#1a1a18' }}>{tValue(opt.label)}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">
                      {block.label === "AI'EN SKAL" ? t('builder.prefix.aiShall') : block.label === 'KONTEKST' ? t('builder.prefix.context') : block.prefix}
                    </span>
                    {block.dropdowns.map((dropdown, dIdx) => (
                      <span key={dropdown.key} className="flex items-center gap-2">
                        {dIdx > 0 && (
                          <span className="text-sm text-gray-600">
                            {block.label === 'KONTEKST' ? t('builder.connector.in') : ''}
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
                              {tValue(opt)}
                            </option>
                          ))}
                        </select>
                      </span>
                    ))}
                    {block.suffix && (
                      <span className="text-sm font-medium text-gray-800">
                        {block.label === 'KONTEKST' ? t('builder.suffix.context') : block.suffix}
                      </span>
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
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">{t('builder.preview')}</h3>
          <div className="rounded-xl border border-[var(--border)] bg-white dark:bg-[#2d2d30] p-5 shadow-sm">
            <div className="space-y-2 text-sm leading-relaxed">
              <p>
                <span
                  className="rounded px-1.5 py-0.5 font-medium"
                  style={{ backgroundColor: BLOCKS[0].color.bg }}
                >
                  {t('builder.prefix.aiShall')}{tValue(selections.role)}
                </span>
              </p>
              <p>
                <span
                  className="rounded px-1.5 py-0.5 font-medium"
                  style={{ backgroundColor: BLOCKS[1].color.bg }}
                >
                  {t('builder.prefix.context')}{tValue(selections.grade)} {t('builder.connector.in')} {tValue(selections.subject)}{t('builder.suffix.context')}
                </span>
              </p>
              <p>
                <span
                  className="rounded px-1.5 py-0.5 font-medium"
                  style={{ backgroundColor: BLOCKS[2].color.bg }}
                >
                  {buildRestrictionText()}
                </span>
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between">
              <span className="text-xs text-gray-400">
                ~{tokenCount} {t('builder.tokens')}
              </span>
            </div>
          </div>

          <button
            onClick={handleStartChat}
            disabled={loading}
            className="mt-4 w-full py-3 px-6 rounded-xl bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('builder.creating') : t('builder.startChat')}
          </button>
        </div>
      </div>
    </div>
  )
}
