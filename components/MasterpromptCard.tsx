'use client'

import { useState } from 'react'

interface MasterpromptCardProps {
  masterprompt: string
  defaultExpanded: boolean
}

interface ParsedBlock {
  label: string
  value: string
  sentence: string
  color: { bg: string; border: string; text: string }
}

const BLOCK_COLORS = [
  { bg: '#CECBF6', border: '#AFA9EC', text: '#5B52C9' },  // Role
  { bg: '#9FE1CB', border: '#5DCAA5', text: '#1D7A55' },  // Context
  { bg: '#B5D4F4', border: '#85B7EB', text: '#2563A8' },  // Goal
  { bg: '#FAC775', border: '#EF9F27', text: '#8B5A00' },  // Behaviour
  { bg: '#C0DD97', border: '#97C459', text: '#3D6B0F' },  // Language
  { bg: '#F5C4B3', border: '#F0997B', text: '#B8432A' },  // Restriction
]

function parseMasterprompt(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = []

  // Match: "Du er en <value>"
  const roleMatch = text.match(/Du er en (.+?)(?:\.|$)/m)
  if (roleMatch) {
    blocks.push({ label: 'Rolle', value: roleMatch[1].trim(), sentence: `Du er en ${roleMatch[1].trim()}`, color: BLOCK_COLORS[0] })
  }

  // Match: "for elever i <grade> i <subject>"
  const contextMatch = text.match(/for elever i (.+?)(?:\.|$)/m)
  if (contextMatch) {
    blocks.push({ label: 'Kontekst', value: contextMatch[1].trim(), sentence: `for elever i ${contextMatch[1].trim()}`, color: BLOCK_COLORS[1] })
  }

  // Match: "Dit mål er at <value>"
  const goalMatch = text.match(/Dit mål er at (.+?)(?:\.|$)/m)
  if (goalMatch) {
    blocks.push({ label: 'Mål', value: goalMatch[1].trim(), sentence: `Dit mål er at ${goalMatch[1].trim()}`, color: BLOCK_COLORS[2] })
  }

  // Match: "Altid <value>"
  const behaviourMatch = text.match(/Altid (.+?)(?:\.|$)/m)
  if (behaviourMatch) {
    blocks.push({ label: 'Adfærd', value: behaviourMatch[1].trim(), sentence: `Altid ${behaviourMatch[1].trim()}`, color: BLOCK_COLORS[3] })
  }

  // Match: "Svar på <value>"
  const languageMatch = text.match(/Svar på (.+?)(?:\.|$)/m)
  if (languageMatch) {
    blocks.push({ label: 'Sprog', value: languageMatch[1].trim(), sentence: `Svar på ${languageMatch[1].trim()}`, color: BLOCK_COLORS[4] })
  }

  // Match: "Aldrig <value>"
  const restrictionMatch = text.match(/Aldrig (.+?)(?:\.|$)/m)
  if (restrictionMatch) {
    blocks.push({ label: 'Begrænsning', value: restrictionMatch[1].trim(), sentence: `Aldrig ${restrictionMatch[1].trim()}`, color: BLOCK_COLORS[5] })
  }

  // Fallback for English-format masterprompts from older sessions
  if (blocks.length === 0) {
    const roleEn = text.match(/You are a (.+?)(?:\.|$)/m)
    if (roleEn) blocks.push({ label: 'Rolle', value: roleEn[1].trim(), sentence: `Du er en ${roleEn[1].trim()}`, color: BLOCK_COLORS[0] })

    const contextEn = text.match(/for (.+?) students in (.+?)(?:\.|$)/m)
    if (contextEn) blocks.push({ label: 'Kontekst', value: `${contextEn[1].trim()} i ${contextEn[2].trim()}`, sentence: `for elever i ${contextEn[1].trim()} i ${contextEn[2].trim()}`, color: BLOCK_COLORS[1] })

    const goalEn = text.match(/Your goal is to (.+?)(?:\.|$)/m)
    if (goalEn) blocks.push({ label: 'Mål', value: goalEn[1].trim(), sentence: `Dit mål er at ${goalEn[1].trim()}`, color: BLOCK_COLORS[2] })

    const behaviourEn = text.match(/Always (.+?)(?:\.|$)/m)
    if (behaviourEn) blocks.push({ label: 'Adfærd', value: behaviourEn[1].trim(), sentence: `Altid ${behaviourEn[1].trim()}`, color: BLOCK_COLORS[3] })

    const languageEn = text.match(/Respond in (.+?)(?:\.|$)/m)
    if (languageEn) blocks.push({ label: 'Sprog', value: languageEn[1].trim(), sentence: `Svar på ${languageEn[1].trim()}`, color: BLOCK_COLORS[4] })

    const restrictionEn = text.match(/Never (.+?)(?:\.|$)/m)
    if (restrictionEn) blocks.push({ label: 'Begrænsning', value: restrictionEn[1].trim(), sentence: `Aldrig ${restrictionEn[1].trim()}`, color: BLOCK_COLORS[5] })
  }

  return blocks
}

export default function MasterpromptCard({ masterprompt, defaultExpanded }: MasterpromptCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const blocks = parseMasterprompt(masterprompt)

  if (blocks.length === 0) return null

  return (
    <div style={{ padding: '0 16px', marginTop: '12px', marginBottom: '4px' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors mb-2"
      >
        <span>{expanded ? '▲' : '▾'}</span>
        {expanded ? 'Skjul masterprompt' : 'Vis masterprompt'}
      </button>

      {expanded && (
        <div style={{
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          backgroundColor: '#ffffff',
          padding: '12px 16px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {blocks.map((block, idx) => (
              <span
                key={idx}
                style={{
                  display: 'inline-block',
                  backgroundColor: block.color.bg,
                  border: `1px solid ${block.color.border}`,
                  color: '#1f2937',
                  fontSize: '14px',
                  fontWeight: 500,
                  padding: '8px 14px',
                  borderRadius: '8px',
                  lineHeight: '1.4',
                  alignSelf: 'flex-start',
                }}
              >
                {block.sentence}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
