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
  goal: string
  behaviour: string
  language: string
  restriction: string
}

const CHIP_COLORS = {
  role:        { bg: '#CECBF6', text: '#534AB7' },
  context:     { bg: '#9FE1CB', text: '#0F6E56' },
  goal:        { bg: '#B5D4F4', text: '#185FA5' },
  behaviour:   { bg: '#FAC775', text: '#854F0B' },
  language:    { bg: '#C0DD97', text: '#3B6D11' },
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

const connectorStyle: React.CSSProperties = {
  color: '#6b7280',
  fontSize: '13px',
  lineHeight: '1.5',
}

function parseMasterprompt(text: string): ParsedValues | null {
  // Danish format (primary): "Du er en X. \nfor elever i 8. klasse i Dansk. \n..."
  const roleMatch = text.match(/Du er en (.+?)(?:\.\s|\.$|$)/m)
  // Context: match "for elever i <grade> i <subject>" — grade can contain "." (e.g. "8. klasse")
  const contextMatch = text.match(/for elever i (.+?\s*klasse|.+?\s*klassetrin|Gymnasiet)\s+i\s+(.+?)(?:\.\s|\.$|$)/m)
  // Fallback: if no "i <subject>" separator, grab the whole thing
  const contextFallback = !contextMatch ? text.match(/for elever i (.+?)(?:\.\s|\.$|$)/m) : null
  const goalMatch = text.match(/Dit mål er at (.+?)(?:\.\s|\.$|$)/m)
  const behaviourMatch = text.match(/Altid (.+?)(?:\.\s|\.$|$)/m)
  const languageMatch = text.match(/Svar på (.+?)(?:\.\s|\.$|$)/m)
  const restrictionMatch = text.match(/Aldrig (.+?)(?:\.\s|\.$|$)/m)

  if (roleMatch) {
    let grade = ''
    let subject = ''
    if (contextMatch) {
      grade = contextMatch[1].trim()
      subject = contextMatch[2].trim()
    } else if (contextFallback) {
      grade = contextFallback[1].trim()
    }

    return {
      role: roleMatch[1].trim(),
      grade,
      subject,
      goal: goalMatch ? goalMatch[1].trim() : '',
      behaviour: behaviourMatch ? behaviourMatch[1].trim() : '',
      language: languageMatch ? languageMatch[1].trim() : '',
      restriction: restrictionMatch ? restrictionMatch[1].trim() : '',
    }
  }

  // Fallback for English-format masterprompts
  const roleEn = text.match(/You are a (.+?)(?:\.\s|\.$|$)/m)
  if (roleEn) {
    const ctxEn = text.match(/for (.+?) students in (.+?)(?:\.\s|\.$|$)/m)
    const goalEn = text.match(/Your goal is to (.+?)(?:\.\s|\.$|$)/m)
    const behEn = text.match(/Always (.+?)(?:\.\s|\.$|$)/m)
    const langEn = text.match(/Respond in (.+?)(?:\.\s|\.$|$)/m)
    const restEn = text.match(/Never (.+?)(?:\.\s|\.$|$)/m)
    return {
      role: roleEn[1].trim(),
      grade: ctxEn ? ctxEn[1].trim() : '',
      subject: ctxEn ? ctxEn[2].trim() : '',
      goal: goalEn ? goalEn[1].trim() : '',
      behaviour: behEn ? behEn[1].trim() : '',
      language: langEn ? langEn[1].trim() : '',
      restriction: restEn ? restEn[1].trim() : '',
    }
  }

  return null
}

export default function MasterpromptCard({ masterprompt, defaultExpanded }: MasterpromptCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const parsed = parseMasterprompt(masterprompt)

  if (!parsed) return null

  return (
    <div style={{ padding: '0 16px', marginTop: '8px', marginBottom: '4px' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ fontSize: '12px', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '4px' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#6b7280')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#9ca3af')}
      >
        {expanded ? '▲ Skjul masterprompt' : '▾ Vis masterprompt'}
      </button>

      {expanded && (
        <div style={{
          borderRadius: '10px',
          border: '1px solid #e5e7eb',
          backgroundColor: '#ffffff',
          padding: '10px 16px',
        }}>
          <span style={connectorStyle}>Du er en </span>
          <span style={chipStyle(CHIP_COLORS.role)}>{parsed.role}</span>
          {parsed.grade && (
            <>
              <span style={connectorStyle}> for elever i </span>
              <span style={chipStyle(CHIP_COLORS.context)}>
                {parsed.grade}{parsed.subject ? ` i ${parsed.subject}` : ''}
              </span>
            </>
          )}
          {parsed.goal && (
            <>
              <span style={connectorStyle}>. Dit mål er at </span>
              <span style={chipStyle(CHIP_COLORS.goal)}>{parsed.goal}</span>
            </>
          )}
          {parsed.behaviour && (
            <>
              <span style={connectorStyle}>. Altid </span>
              <span style={chipStyle(CHIP_COLORS.behaviour)}>{parsed.behaviour}</span>
            </>
          )}
          {parsed.language && (
            <>
              <span style={connectorStyle}>. Svar på </span>
              <span style={chipStyle(CHIP_COLORS.language)}>{parsed.language}</span>
            </>
          )}
          {parsed.restriction && (
            <>
              <span style={connectorStyle}>. Aldrig </span>
              <span style={chipStyle(CHIP_COLORS.restriction)}>{parsed.restriction}</span>
            </>
          )}
          <span style={connectorStyle}>.</span>
        </div>
      )}
    </div>
  )
}
