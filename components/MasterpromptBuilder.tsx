/*
 * MasterpromptBuilder.tsx
 *
 * This file defines and exports the MasterpromptBuilder React component — the main UI
 * teachers use to configure a new ThinkBot chat session before it starts.
 *
 * What it does:
 *   - Renders three coloured "building block" cards: Role (AI'EN SKAL), Context (KONTEKST),
 *     and Restriction (BEGRÆNSNING). The first two use dropdown menus; the third uses checkboxes.
 *   - Assembles the teacher's selections into a structured Danish masterprompt string, which
 *     becomes the system prompt sent to Claude for the entire chat session.
 *   - Shows a live preview panel on the right so teachers can see the exact prompt as they build it,
 *     along with a rough token estimate.
 *   - On "Start chat", inserts a new row in the Supabase `chat_sessions` table and navigates
 *     the browser to the newly created chat page (/chat/[id]).
 *
 * Exports:
 *   - MasterpromptBuilder (default export): a standalone React component with no required props.
 *
 * How it fits in the app:
 *   - Rendered by MasterpromptModal (and the /builder page) when a teacher wants to create a new session.
 *   - Works alongside Sidebar.tsx, which opens the modal that wraps this component.
 */

// Marks this as a client component so it can manage form state and respond to user interactions.
'use client'

// Imports useState to track the currently selected dropdown values and checked restriction options.
import { useState } from 'react'
// Imports useRouter to navigate to the newly created chat session after the teacher clicks "Start chat".
import { useRouter } from 'next/navigation'
// Imports the browser-side Supabase client to create a new chat session in the database.
import { createClient } from '@/lib/supabase'

/*
 * BlockConfig is a TypeScript interface that defines the shape of a single building block
 * configuration object used to render one of the three prompt-builder cards (Role, Context,
 * Restriction). It describes the card's display label, static text fragments, colour scheme,
 * and the list of dropdown menus (if any) it contains.
 */
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

/*
 * BLOCKS is an array of BlockConfig objects (three elements) that defines the three prompt-builder
 * cards in their display order: Role, Context, Restriction.
 *
 * - BLOCKS[0] ("AI'EN SKAL"): a single "role" dropdown listing the tasks the AI should perform.
 * - BLOCKS[1] ("KONTEKST"): two dropdowns — "grade" (school year) and "subject" (school subject).
 * - BLOCKS[2] ("BEGRÆNSNING"): no dropdowns; uses the RESTRICTION_OPTIONS checkboxes instead.
 *
 * This array is iterated in the JSX to render each card without duplicating markup.
 */
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

/*
 * RESTRICTION_OPTIONS is an array of objects, where each object has:
 *   - label (string): the human-readable description shown next to the checkbox in the UI.
 *   - prompt (string): the machine-readable phrase inserted after "Aldrig " in the masterprompt.
 *
 * Teachers check one or more of these options; the checked prompts are joined and appended to
 * the restriction line of the assembled masterprompt.
 */
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

/*
 * MasterpromptBuilder is a function (React component) that takes no parameters and returns JSX.
 *
 * It renders the full masterprompt configuration UI, including the three building block cards,
 * the live preview panel, and the "Start chat" button.
 */
// The masterprompt builder form. Teachers configure the bot's role, context, and restrictions,
// then click "Start chat" to create a new session and navigate to it.
export default function MasterpromptBuilder() {
  // router is a Next.js router object used to navigate programmatically after session creation or
  // when the user is not logged in.
  const router = useRouter()
  // supabase is the browser-side Supabase client instance used for auth and database operations.
  const supabase = createClient()

  /*
   * selections is a Record<string, string> state variable that maps each dropdown key
   * ('role', 'grade', 'subject') to the currently selected option string.
   * Initialised to the first option in each dropdown so the preview is always populated.
   */
  // Tracks the currently selected value for each dropdown (role, grade, subject).
  // Initialised to the first option in each list so the preview is always populated.
  const [selections, setSelections] = useState<Record<string, string>>({
    role: BLOCKS[0].dropdowns[0].options[0],
    grade: BLOCKS[1].dropdowns[0].options[0],
    subject: BLOCKS[1].dropdowns[1].options[0],
  })

  /*
   * checkedRestrictions is an array of boolean state variables (one entry per RESTRICTION_OPTIONS item)
   * that tracks which restriction checkboxes are currently checked.
   * The first restriction is checked by default; the rest are unchecked.
   */
  // Tracks which restriction checkboxes are checked. The first restriction is checked by default.
  const [checkedRestrictions, setCheckedRestrictions] = useState([true, false, false, false, false])

  /*
   * loading is a boolean state variable that is true while the Supabase insert request is in flight.
   * While true, the "Start chat" button is disabled to prevent duplicate submissions.
   */
  // True while the session creation request is in flight — disables the "Start chat" button.
  const [loading, setLoading] = useState(false)

  /*
   * handleChange is a function that takes two parameters (key: string, value: string) and returns void.
   *
   * It updates the `selections` state by replacing the entry at `key` with `value`.
   * Called by each <select> element's onChange handler when the teacher changes a dropdown.
   *
   * Parameters:
   *   key   — the dropdown identifier, e.g. 'role', 'grade', or 'subject'.
   *   value — the newly selected option string from that dropdown.
   */
  // Updates the stored selection when the user changes a dropdown value.
  function handleChange(key: string, value: string) {
    setSelections((prev) => ({ ...prev, [key]: value }))
  }

  /*
   * handleRestrictionToggle is a function that takes one parameter (index: number) and returns void.
   *
   * It toggles the boolean at position `index` in the `checkedRestrictions` array.
   * Safety rule: if the teacher tries to uncheck the last remaining checked restriction, the
   * function returns early without making any change — at least one restriction must always be active.
   *
   * Algorithm steps:
   *   1. Count the number of currently checked restrictions.
   *   2. If the targeted restriction is currently checked AND it is the only one checked, abort.
   *   3. Otherwise, copy the array, flip the boolean at `index`, and update state.
   *
   * Parameters:
   *   index — the zero-based position of the restriction to toggle in RESTRICTION_OPTIONS.
   */
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

  /*
   * buildRestrictionText is a function that takes no parameters and returns a string.
   *
   * It collects the `prompt` phrases from all checked RESTRICTION_OPTIONS entries and joins them
   * into a single grammatically correct Danish string:
   *   - 1 item  → returned as-is.
   *   - 2+ items → all but the last joined by ", ", then the last appended with " og ".
   * Example: "A, B og C"
   *
   * The returned string is used directly in the "Aldrig ..." line of the masterprompt.
   */
  // Builds the restriction text for the "Aldrig ..." line by joining all checked restriction prompts.
  // Multiple restrictions are joined with commas and "og" (e.g. "A, B og C").
  function buildRestrictionText(): string {
    const selected = RESTRICTION_OPTIONS
      .filter((_, i) => checkedRestrictions[i]) // Keeps only checked restrictions.
      .map((opt) => opt.prompt) // Uses the machine-readable prompt phrase, not the UI label.
    if (selected.length === 1) return selected[0]
    return selected.slice(0, -1).join(', ') + ' og ' + selected[selected.length - 1]
  }

  /*
   * assemblePrompt is a function that takes no parameters and returns a string.
   *
   * It composes the complete masterprompt by concatenating three Danish instruction lines:
   *   Line 1: The AI's role, from the 'role' dropdown.
   *   Line 2: The educational context, from the 'grade' and 'subject' dropdowns.
   *   Line 3: The restriction rule, built by buildRestrictionText().
   *
   * The three lines are joined with ". \n" to form a readable multi-line instruction.
   * The resulting string is the exact text stored in Supabase and forwarded to Claude as the
   * system prompt for the entire chat session.
   */
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

  /*
   * estimateTokens is a function that takes one parameter (text: string) and returns a number.
   *
   * It provides a rough token count for the assembled prompt by splitting `text` on whitespace,
   * counting the resulting words, and multiplying by 1.3 — a common approximation for Danish/English
   * text where many words tokenise as more than one token.
   *
   * Parameters:
   *   text — the assembled masterprompt string to estimate.
   *
   * Returns:
   *   A rounded integer representing the estimated token count.
   */
  // Provides a rough token estimate for the assembled prompt.
  // Words × 1.3 is a common approximation for English/Danish text (some words split into multiple tokens).
  function estimateTokens(text: string): number {
    const words = text.split(/\s+/).length
    return Math.round(words * 1.3)
  }

  /*
   * handleStartChat is an async function that takes no parameters and returns Promise<void>.
   *
   * Algorithm steps:
   *   1. Set loading to true to disable the button.
   *   2. Fetch the current user from Supabase auth; redirect to /login if not authenticated.
   *   3. Call assemblePrompt() to capture the final masterprompt string.
   *   4. Insert a new row into the `chat_sessions` table with the user's ID, a placeholder title,
   *      and the assembled masterprompt. Request the created row back (.select().single()) to read
   *      the database-generated session ID.
   *   5. Navigate to /chat/[session.id] to open the new chat.
   *   6. In the finally block, reset loading to false.
   */
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

  // prompt is a string constant holding the fully assembled masterprompt for the current selections.
  // Used for the live preview and the token estimate shown in the UI.
  const prompt = assemblePrompt()
  // tokenCount is a number constant representing the estimated token count for the current prompt.
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
