'use client'

import { useState } from 'react'

interface MasterpromptCardProps {
  masterprompt: string
  defaultExpanded: boolean
}

interface ParsedBlock {
  label: string
  value: string
  color: { bg: string; text: string }
}

const BLOCK_COLORS = [
  { bg: '#CECBF6', text: '#5B52C9' },  // Role
  { bg: '#9FE1CB', text: '#1D7A55' },  // Context
  { bg: '#B5D4F4', text: '#2563A8' },  // Goal
  { bg: '#FAC775', text: '#8B5A00' },  // Behaviour
  { bg: '#C0DD97', text: '#3D6B0F' },  // Language
  { bg: '#F5C4B3', text: '#B8432A' },  // Restriction
]

function parseMasterprompt(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = []

  // Match: "Du er en <value>"
  const roleMatch = text.match(/Du er en (.+?)(?:\.|$)/m)
  if (roleMatch) {
    blocks.push({ label: 'Rolle', value: roleMatch[1].trim(), color: BLOCK_COLORS[0] })
  }

  // Match: "for elever i <grade> i <subject>"
  const contextMatch = text.match(/for elever i (.+?)(?:\.|$)/m)
  if (contextMatch) {
    blocks.push({ label: 'Kontekst', value: contextMatch[1].trim(), color: BLOCK_COLORS[1] })
  }

  // Match: "Dit mål er at <value>"
  const goalMatch = text.match(/Dit mål er at (.+?)(?:\.|$)/m)
  if (goalMatch) {
    blocks.push({ label: 'Mål', value: goalMatch[1].trim(), color: BLOCK_COLORS[2] })
  }

  // Match: "Altid <value>"
  const behaviourMatch = text.match(/Altid (.+?)(?:\.|$)/m)
  if (behaviourMatch) {
    blocks.push({ label: 'Adfærd', value: behaviourMatch[1].trim(), color: BLOCK_COLORS[3] })
  }

  // Match: "Svar på <value>"
  const languageMatch = text.match(/Svar på (.+?)(?:\.|$)/m)
  if (languageMatch) {
    blocks.push({ label: 'Sprog', value: languageMatch[1].trim(), color: BLOCK_COLORS[4] })
  }

  // Match: "Aldrig <value>"
  const restrictionMatch = text.match(/Aldrig (.+?)(?:\.|$)/m)
  if (restrictionMatch) {
    blocks.push({ label: 'Begrænsning', value: restrictionMatch[1].trim(), color: BLOCK_COLORS[5] })
  }

  // Fallback for English-format masterprompts from older sessions
  if (blocks.length === 0) {
    const roleEn = text.match(/You are a (.+?)(?:\.|$)/m)
    if (roleEn) blocks.push({ label: 'Rolle', value: roleEn[1].trim(), color: BLOCK_COLORS[0] })

    const contextEn = text.match(/for (.+?) students in (.+?)(?:\.|$)/m)
    if (contextEn) blocks.push({ label: 'Kontekst', value: `${contextEn[1].trim()} i ${contextEn[2].trim()}`, color: BLOCK_COLORS[1] })

    const goalEn = text.match(/Your goal is to (.+?)(?:\.|$)/m)
    if (goalEn) blocks.push({ label: 'Mål', value: goalEn[1].trim(), color: BLOCK_COLORS[2] })

    const behaviourEn = text.match(/Always (.+?)(?:\.|$)/m)
    if (behaviourEn) blocks.push({ label: 'Adfærd', value: behaviourEn[1].trim(), color: BLOCK_COLORS[3] })

    const languageEn = text.match(/Respond in (.+?)(?:\.|$)/m)
    if (languageEn) blocks.push({ label: 'Sprog', value: languageEn[1].trim(), color: BLOCK_COLORS[4] })

    const restrictionEn = text.match(/Never (.+?)(?:\.|$)/m)
    if (restrictionEn) blocks.push({ label: 'Begrænsning', value: restrictionEn[1].trim(), color: BLOCK_COLORS[5] })
  }

  return blocks
}

export default function MasterpromptCard({ masterprompt, defaultExpanded }: MasterpromptCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const blocks = parseMasterprompt(masterprompt)

  if (blocks.length === 0) return null

  return (
    <div className="mx-6 mt-3 mb-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors mb-2"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        {expanded ? 'Skjul masterprompt' : 'Vis masterprompt'}
      </button>

      {expanded && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {blocks.map((block, idx) => (
              <span
                key={idx}
                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  backgroundColor: block.color.bg,
                  color: block.color.text,
                }}
              >
                {block.value}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
