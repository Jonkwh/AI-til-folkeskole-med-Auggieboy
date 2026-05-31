// Marks this as a client component because it manages the expand/collapse toggle state.
'use client'

// Imports the useState hook to track whether the card is expanded or collapsed.
import { useState } from 'react'
import { useLanguage } from '@/lib/LanguageContext'
import { VALUE_TRANSLATIONS, type Language } from '@/lib/translations'

// Props accepted by MasterpromptCard.
interface MasterpromptCardProps {
  masterprompt: string // The raw masterprompt text to parse and display as coloured chips.
  defaultExpanded: boolean // Whether the card should start open (true for new chats, false for returning sessions).
}

// Shape of the structured values extracted from the masterprompt string.
interface ParsedValues {
  role: string
  grade: string
  subject: string
  hasDanskSkole: boolean // True when the phrase "i en dansk skole" appears in the prompt.
  restriction: string
}

// Background and text colours for each of the three chip types in the card.
const CHIP_COLORS = {
  role:        { bg: '#CECBF6', text: '#534AB7' }, // Purple — the bot's role.
  context:     { bg: '#9FE1CB', text: '#0F6E56' }, // Green — grade and subject.
  restriction: { bg: '#F5C4B3', text: '#993C1D' }, // Red/orange — the "never do this" rule.
}

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

// Tailwind class string for the plain connector words between chips (e.g. "AI'en skal", "for elever i").
const connectorClass = 'text-gray-500 dark:text-gray-400 text-[13px] leading-[1.5]'

// Parses a raw masterprompt string into its structured parts so each can be displayed as a separate chip.
// Returns null if no recognizable role phrase is found — the card will not render in that case.
function parseMasterprompt(text: string): ParsedValues | null {
  // New format: "AI'en skal <value>"
  const roleNewMatch = text.match(/AI'en skal (.+?)(?:\.\s|\.$|$)/m)
  // Legacy format: "Du er en <value>"
  const roleLegacyMatch = !roleNewMatch ? text.match(/Du er en (.+?)(?:\.\s|\.$|$)/m) : null

  // Takes the matched role value from whichever format was found.
  const roleValue = roleNewMatch ? roleNewMatch[1].trim() : roleLegacyMatch ? roleLegacyMatch[1].trim() : null

  // Tries to extract grade (e.g. "8. klasse") and subject from the context line.
  const contextMatch = text.match(/for elever i (.+?\s*klasse)\s+i\s+(.+?)(?:\s+i en dansk skole)?(?:\.\s|\.$|$)/m)
  // Fallback: extracts just whatever follows "for elever i" if the full format isn't matched.
  const contextFallback = !contextMatch ? text.match(/for elever i (.+?)(?:\.\s|\.$|$)/m) : null

  // Extracts the restriction phrase following "Aldrig".
  const restrictionMatch = text.match(/Aldrig (.+?)(?:\.\s|\.$|$)/m)

  // English-language fallbacks for prompts that were written before the Danish format was standardised.
  const roleEn = !roleValue ? text.match(/You are a (.+?)(?:\.\s|\.$|$)/m) : null
  const ctxEn = roleEn ? text.match(/for (.+?) students in (.+?)(?:\.\s|\.$|$)/m) : null
  const restEn = roleEn ? text.match(/Never (.+?)(?:\.\s|\.$|$)/m) : null

  // Uses the Danish role value if found; falls back to the English match.
  const finalRole = roleValue || (roleEn ? roleEn[1].trim() : null)
  // If no role was found at all, the text is unrecognisable and the card should not render.
  if (!finalRole) return null

  let grade = ''
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

const KNOWN_VALUES_BY_LENGTH = Object.keys(VALUE_TRANSLATIONS).sort(
  (a, b) => b.length - a.length,
)

function translateRestriction(text: string, tValue: (s: string) => string, lang: Language): string {
  const direct = tValue(text)
  if (direct !== text) return direct

  const parts: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    const match = KNOWN_VALUES_BY_LENGTH.find((k) => remaining.startsWith(k))
    if (match) {
      parts.push(tValue(match))
      remaining = remaining.slice(match.length)
      remaining = remaining.replace(/^(, | og )/, '')
    } else {
      parts.push(remaining)
      break
    }
  }
  if (parts.length <= 1) return parts[0] || text
  const connector = lang === 'en' ? ' and ' : ' og '
  return parts.slice(0, -1).join(', ') + connector + parts[parts.length - 1]
}

// Collapsible summary card shown at the top of the chat view.
// Displays the masterprompt as colour-coded chips so the student can see what the bot is configured to do.
export default function MasterpromptCard({ masterprompt, defaultExpanded }: MasterpromptCardProps) {
  // Controls whether the chip summary is visible or hidden below the toggle button.
  const [expanded, setExpanded] = useState(defaultExpanded)
  const { t, tValue, lang } = useLanguage()
  // Parses the raw masterprompt string into structured role/grade/subject/restriction values.
  const parsed = parseMasterprompt(masterprompt)

  // If the masterprompt couldn't be parsed (e.g. empty or unrecognised format), render nothing.
  if (!parsed) return null

  // Detect new format vs legacy to use the correct connector phrase before the role chip.
  const isNewFormat = masterprompt.includes("AI'en skal")

  return (
    <div style={{ padding: '0 16px', marginTop: '8px', marginBottom: '4px' }}>
      {/* Toggle button that shows or hides the chip summary. */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 bg-none border-none cursor-pointer p-0 mb-1 transition-colors"
      >
        {expanded ? t('card.hide') : t('card.show')}
      </button>

      {/* Chip summary — only rendered when the card is expanded. */}
      {expanded && (
        <div className="rounded-[10px] border border-[var(--border)] bg-white dark:bg-[#2d2d30] px-4 py-2.5">
          <span className={connectorClass}>{isNewFormat ? t('card.prefix.new') : t('card.prefix.legacy')}</span>
          <span style={chipStyle(CHIP_COLORS.role)}>{tValue(parsed.role)}</span>
          {parsed.grade && (
            <>
              <span className={connectorClass}>{t('card.connector.for')}</span>
              <span style={chipStyle(CHIP_COLORS.context)}>
                {tValue(parsed.grade)}{parsed.subject ? `${t('card.connector.in')}${tValue(parsed.subject)}` : ''}
              </span>
              {parsed.hasDanskSkole && (
                <span className={connectorClass}>{t('card.connector.school')}</span>
              )}
            </>
          )}
          {parsed.restriction && (
            <>
              <span className={connectorClass}>{t('card.connector.never')}</span>
              <span style={chipStyle(CHIP_COLORS.restriction)}>{translateRestriction(parsed.restriction, tValue, lang)}</span>
            </>
          )}
          {/* Closing period to make the summary read as a complete sentence. */}
          <span className={connectorClass}>.</span>
        </div>
      )}
    </div>
  )
}
