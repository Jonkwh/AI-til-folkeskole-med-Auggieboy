'use client'

import { useState } from 'react'

interface MasterpromptCardProps {
  masterprompt: string
  defaultExpanded: boolean
}

interface ParsedValues {
  role: string
  grade: string
  subject: string
  hasDanskSkole: boolean
  restriction: string
}

const CHIP_COLORS = {
  role:        { bg: '#CECBF6', text: '#534AB7' },
  context:     { bg: '#9FE1CB', text: '#0F6E56' },
  restriction: { bg: '#F5C4B3', text: '#993C1D' },
}

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

const connectorClass = 'text-gray-500 dark:text-gray-400 text-[13px] leading-[1.5]'

function parseMasterprompt(text: string): ParsedValues | null {
  // New format: "AI'en skal <value>"
  const roleNewMatch = text.match(/AI'en skal (.+?)(?:\.\s|\.$|$)/m)
  // Legacy format: "Du er en <value>"
  const roleLegacyMatch = !roleNewMatch ? text.match(/Du er en (.+?)(?:\.\s|\.$|$)/m) : null

  const roleValue = roleNewMatch ? roleNewMatch[1].trim() : roleLegacyMatch ? roleLegacyMatch[1].trim() : null

  // Context: "for elever i <grade> i <subject> [i en dansk skole]"
  const contextMatch = text.match(/for elever i (.+?\s*klasse)\s+i\s+(.+?)(?:\s+i en dansk skole)?(?:\.\s|\.$|$)/m)
  const contextFallback = !contextMatch ? text.match(/for elever i (.+?)(?:\.\s|\.$|$)/m) : null

  const restrictionMatch = text.match(/Aldrig (.+?)(?:\.\s|\.$|$)/m)

  // English fallback
  const roleEn = !roleValue ? text.match(/You are a (.+?)(?:\.\s|\.$|$)/m) : null
  const ctxEn = roleEn ? text.match(/for (.+?) students in (.+?)(?:\.\s|\.$|$)/m) : null
  const restEn = roleEn ? text.match(/Never (.+?)(?:\.\s|\.$|$)/m) : null

  const finalRole = roleValue || (roleEn ? roleEn[1].trim() : null)
  if (!finalRole) return null

  let grade = ''
  let subject = ''
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
    hasDanskSkole: text.includes('i en dansk skole'),
    restriction: restrictionMatch ? restrictionMatch[1].trim() : (restEn ? restEn[1].trim() : ''),
  }
}

export default function MasterpromptCard({ masterprompt, defaultExpanded }: MasterpromptCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const parsed = parseMasterprompt(masterprompt)

  if (!parsed) return null

  // Detect new format vs legacy
  const isNewFormat = masterprompt.includes("AI'en skal")

  return (
    <div style={{ padding: '0 16px', marginTop: '8px', marginBottom: '4px' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 bg-none border-none cursor-pointer p-0 mb-1 transition-colors"
      >
        {expanded ? '▲ Skjul masterprompt' : '▾ Vis masterprompt'}
      </button>

      {expanded && (
        <div className="rounded-[10px] border border-[var(--border)] bg-white dark:bg-[#2d2d30] px-4 py-2.5">
          <span className={connectorClass}>{isNewFormat ? "AI'en skal " : 'Du er en '}</span>
          <span style={chipStyle(CHIP_COLORS.role)}>{parsed.role}</span>
          {parsed.grade && (
            <>
              <span className={connectorClass}> for elever i </span>
              <span style={chipStyle(CHIP_COLORS.context)}>
                {parsed.grade}{parsed.subject ? ` i ${parsed.subject}` : ''}
              </span>
              {parsed.hasDanskSkole && (
                <span className={connectorClass}> i en dansk skole</span>
              )}
            </>
          )}
          {parsed.restriction && (
            <>
              <span className={connectorClass}>. Aldrig </span>
              <span style={chipStyle(CHIP_COLORS.restriction)}>{parsed.restriction}</span>
            </>
          )}
          <span className={connectorClass}>.</span>
        </div>
      )}
    </div>
  )
}
