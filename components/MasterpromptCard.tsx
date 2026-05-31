/*
 * MasterpromptCard.tsx
 *
 * This file exports the MasterpromptCard component — a collapsible summary card that
 * appears at the top of the student chat view. It parses a raw masterprompt string and
 * displays its key parts (role, grade, subject, restriction) as colour-coded inline chips,
 * so students can immediately see how the AI has been configured for their session.
 *
 * Exports:
 *   - default: MasterpromptCard (React functional component)
 *
 * How it fits in the app:
 *   The chat page passes the active session's masterprompt string down to this component.
 *   MasterpromptCard parses that string with parseMasterprompt() and renders the result
 *   as a compact, human-readable sentence using coloured chips. The card can be toggled
 *   open or closed by the student, and defaults to open for newly created sessions.
 */

// Marks this as a client component because it manages the expand/collapse toggle state.
'use client'

// Imports the useState hook to track whether the card is expanded or collapsed.
import { useState } from 'react'

/*
 * MasterpromptCardProps is a TypeScript interface that defines the shape of the props
 * object accepted by MasterpromptCard. It requires:
 *   - masterprompt: a string containing the raw masterprompt text to parse and display
 *   - defaultExpanded: a boolean that sets the initial open/closed state of the card
 */
// Props accepted by MasterpromptCard.
interface MasterpromptCardProps {
  masterprompt: string // The raw masterprompt text to parse and display as coloured chips.
  defaultExpanded: boolean // Whether the card should start open (true for new chats, false for returning sessions).
}

/*
 * ParsedValues is a TypeScript interface that defines the shape of the structured object
 * returned by parseMasterprompt(). It holds the individual pieces extracted from the raw
 * masterprompt string so each can be rendered as its own chip:
 *   - role: the AI's configured role (string)
 *   - grade: the school grade level (string, may be empty)
 *   - subject: the school subject (string, may be empty)
 *   - hasDanskSkole: a boolean flag indicating whether "i en dansk skole" was present
 *   - restriction: the "never do this" rule (string, may be empty)
 */
// Shape of the structured values extracted from the masterprompt string.
interface ParsedValues {
  role: string
  grade: string
  subject: string
  hasDanskSkole: boolean // True when the phrase "i en dansk skole" appears in the prompt.
  restriction: string
}

/*
 * CHIP_COLORS is an object constant (Record<string, { bg: string; text: string }>) that
 * maps each chip category to its background colour and text colour. Three categories are
 * defined: 'role' (purple), 'context' (green), and 'restriction' (red/orange). These
 * colours are consistent with the ThinkBot design system and are applied via inline styles
 * so they are not affected by Tailwind's purge step.
 */
// Background and text colours for each of the three chip types in the card.
const CHIP_COLORS = {
  role:        { bg: '#CECBF6', text: '#534AB7' }, // Purple — the bot's role.
  context:     { bg: '#9FE1CB', text: '#0F6E56' }, // Green — grade and subject.
  restriction: { bg: '#F5C4B3', text: '#993C1D' }, // Red/orange — the "never do this" rule.
}

/*
 * chipStyle is a function that takes 1 parameter
 *   (color: { bg: string; text: string })
 * and returns React.CSSProperties — an inline style object.
 *
 * It builds the shared layout and typography styles for every chip, then merges in the
 * caller-supplied background and text colours. Using an inline style (rather than Tailwind)
 * ensures the exact hex values from CHIP_COLORS are applied at runtime.
 */
// Returns the inline CSS object used to style each coloured chip in the summary card.
const chipStyle = (color: { bg: string; text: string }): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: '6px',
  fontWeight: 500,
  fontSize: '13px',
  lineHeight: '1.5',
  backgroundColor: color.bg,
  color: color.text,
})

/*
 * connectorClass is a string constant containing a Tailwind class string. It styles the
 * plain-text connector words that appear between chips (e.g. "AI'en skal", "for elever i",
 * ". Aldrig"). Using a shared constant prevents the same class string from being duplicated
 * across multiple JSX elements.
 */
// Tailwind class string for the plain connector words between chips (e.g. "AI'en skal", "for elever i").
const connectorClass = 'text-gray-500 dark:text-gray-400 text-[13px] leading-[1.5]'

/*
 * parseMasterprompt is a function that takes 1 parameter
 *   (text: string)
 * and returns ParsedValues | null.
 *
 * Algorithm summary:
 *   1. Try to match the new Danish format "AI'en skal <value>" with a regex.
 *   2. If that fails, fall back to the legacy Danish format "Du er en <value>".
 *   3. Try to extract grade and subject from a "for elever i <grade> i <subject>" line.
 *   4. If the full context line fails, fall back to extracting just the grade.
 *   5. Try to extract the restriction from an "Aldrig <value>" sentence.
 *   6. If no Danish role was found, try English fallbacks ("You are a ...", "Never ...").
 *   7. If no role was found at all, return null — the card will not render.
 *   8. Otherwise return a structured ParsedValues object.
 */
// Parses a raw masterprompt string into its structured parts so each can be displayed as a separate chip.
// Returns null if no recognizable role phrase is found — the card will not render in that case.
function parseMasterprompt(text: string): ParsedValues | null {
  // New format: "AI'en skal <value>"
  const roleNewMatch = text.match(/AI'en skal (.+?)(?:\.\s|\.$|$)/m)
  // Legacy format: "Du er en <value>"
  const roleLegacyMatch = !roleNewMatch ? text.match(/Du er en (.+?)(?:\.\s|\.$|$)/m) : null

  // Takes the matched role value from whichever format was found.
  // roleValue is a string or null — null means no recognisable role line was present.
  const roleValue = roleNewMatch ? roleNewMatch[1].trim() : roleLegacyMatch ? roleLegacyMatch[1].trim() : null

  // Tries to extract grade (e.g. "8. klasse") and subject from the context line.
  // contextMatch is a RegExpMatchArray or null.
  const contextMatch = text.match(/for elever i (.+?\s*klasse)\s+i\s+(.+?)(?:\s+i en dansk skole)?(?:\.\s|\.$|$)/m)
  // Fallback: extracts just whatever follows "for elever i" if the full format isn't matched.
  // contextFallback is a RegExpMatchArray or null.
  const contextFallback = !contextMatch ? text.match(/for elever i (.+?)(?:\.\s|\.$|$)/m) : null

  // Extracts the restriction phrase following "Aldrig".
  // restrictionMatch is a RegExpMatchArray or null.
  const restrictionMatch = text.match(/Aldrig (.+?)(?:\.\s|\.$|$)/m)

  // English-language fallbacks for prompts that were written before the Danish format was standardised.
  // roleEn is a RegExpMatchArray or null — only attempted when no Danish role was found.
  const roleEn = !roleValue ? text.match(/You are a (.+?)(?:\.\s|\.$|$)/m) : null
  // ctxEn is a RegExpMatchArray or null — only attempted when the English role fallback was used.
  const ctxEn = roleEn ? text.match(/for (.+?) students in (.+?)(?:\.\s|\.$|$)/m) : null
  // restEn is a RegExpMatchArray or null — only attempted when the English role fallback was used.
  const restEn = roleEn ? text.match(/Never (.+?)(?:\.\s|\.$|$)/m) : null

  // Uses the Danish role value if found; falls back to the English match.
  // finalRole is a string or null.
  const finalRole = roleValue || (roleEn ? roleEn[1].trim() : null)
  // If no role was found at all, the text is unrecognisable and the card should not render.
  if (!finalRole) return null

  // grade is a string — the school grade level, e.g. "8. klasse". Empty string if not found.
  let grade = ''
  // subject is a string — the school subject, e.g. "Dansk". Empty string if not found.
  let subject = ''
  // Assigns grade and subject from whichever context match succeeded.
  if (contextMatch) {
    grade = contextMatch[1].trim()
    subject = contextMatch[2].trim()
  } else if (contextFallback) {
    grade = contextFallback[1].trim()
  } else if (ctxEn) {
    grade = ctxEn[1].trim()
    subject = ctxEn[2].trim()
  }

  return {
    role: finalRole,
    grade,
    subject,
    hasDanskSkole: text.includes('i en dansk skole'), // Used to append the school context phrase to the chip.
    restriction: restrictionMatch ? restrictionMatch[1].trim() : (restEn ? restEn[1].trim() : ''),
  }
}

/*
 * MasterpromptCard is a function that takes 1 parameter
 *   ({ masterprompt, defaultExpanded }: MasterpromptCardProps)
 * and returns JSX (a React element) or null.
 *
 * It calls parseMasterprompt to extract structured values from the raw masterprompt string.
 * If parsing fails, it returns null (renders nothing). Otherwise it renders a toggle button
 * and, when expanded, a row of colour-coded chips that summarise the session configuration
 * in a human-readable sentence.
 */
// Collapsible summary card shown at the top of the chat view.
// Displays the masterprompt as colour-coded chips so the student can see what the bot is configured to do.
export default function MasterpromptCard({ masterprompt, defaultExpanded }: MasterpromptCardProps) {
  // expanded is a boolean state variable — controls whether the chip summary is visible or hidden.
  const [expanded, setExpanded] = useState(defaultExpanded)
  // parsed is a ParsedValues object or null — the structured result of parsing the raw masterprompt string.
  const parsed = parseMasterprompt(masterprompt)

  // If the masterprompt couldn't be parsed (e.g. empty or unrecognised format), render nothing.
  if (!parsed) return null

  // isNewFormat is a boolean constant — true when the masterprompt uses the newer "AI'en skal" phrasing,
  // which determines which connector word is shown before the role chip.
  const isNewFormat = masterprompt.includes("AI'en skal")

  return (
    <div style={{ padding: '0 16px', marginTop: '8px', marginBottom: '4px' }}>
      {/* Toggle button that shows or hides the chip summary. */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 bg-none border-none cursor-pointer p-0 mb-1 transition-colors"
      >
        {expanded ? '▲ Skjul masterprompt' : '▾ Vis masterprompt'}
      </button>

      {/* Chip summary — only rendered when the card is expanded. */}
      {expanded && (
        <div className="rounded-[10px] border border-[var(--border)] bg-white dark:bg-[#2d2d30] px-4 py-2.5">
          {/* Connector text + role chip: e.g. "AI'en skal [hjælpe med at forstå opgaven]" */}
          <span className={connectorClass}>{isNewFormat ? "AI'en skal " : 'Du er en '}</span>
          <span style={chipStyle(CHIP_COLORS.role)}>{parsed.role}</span>
          {parsed.grade && (
            <>
              {/* Context chip: grade and optionally subject, e.g. "[8. klasse i Dansk]" */}
              <span className={connectorClass}> for elever i </span>
              <span style={chipStyle(CHIP_COLORS.context)}>
                {parsed.grade}{parsed.subject ? ` i ${parsed.subject}` : ''}
              </span>
              {/* Appends the school-context phrase when present in the original prompt. */}
              {parsed.hasDanskSkole && (
                <span className={connectorClass}> i en dansk skole</span>
              )}
            </>
          )}
          {parsed.restriction && (
            <>
              {/* Restriction chip: e.g. ". Aldrig [skifte til et andet sprog]" */}
              <span className={connectorClass}>. Aldrig </span>
              <span style={chipStyle(CHIP_COLORS.restriction)}>{parsed.restriction}</span>
            </>
          )}
          {/* Closing period to make the summary read as a complete sentence. */}
          <span className={connectorClass}>.</span>
        </div>
      )}
    </div>
  )
}
