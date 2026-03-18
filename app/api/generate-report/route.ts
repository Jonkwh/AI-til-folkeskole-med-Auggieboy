import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Claude only generates the OVERSIGT paragraph — all structure is built in code.
const SYSTEM_PROMPT = `Du er en assistent der hjælper lærere med at forstå, hvordan elever har brugt et AI-værktøj kaldet ThinkBot.

Skriv 3-5 sætninger i klart dansk om hvad eleven arbejdede med og hvilken slags hjælp de bad om. Ingen overskrift, ingen markdown, ingen emojis.`

// ── ASCII table helpers ───────────────────────────────────────────────
// Total line width: 74 chars
// Single-column inner: 70 chars  →  | + sp + 70 + sp + | = 74
// Two-column inner: left 20, right 47  → | sp 20 sp | sp 47 sp | = 74

const W = 70
const L = 20
const R = 47

function wrapText(text: string, width: number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    const trimmed = para.trim()
    if (!trimmed) { lines.push(''); continue }
    const words = trimmed.split(' ')
    let current = ''
    for (const word of words) {
      if (!current) {
        current = word
      } else if (current.length + 1 + word.length <= width) {
        current += ' ' + word
      } else {
        lines.push(current)
        current = word
      }
    }
    if (current) lines.push(current)
  }
  return lines.length ? lines : ['']
}

const hFull  = () => '+' + '-'.repeat(W + 2) + '+'
const hTwo   = () => '+' + '-'.repeat(L + 2) + '+' + '-'.repeat(R + 2) + '+'
const rFull  = (t: string) => `| ${t.padEnd(W)} |`
const rStats = (label: string, val: string) => `| ${label.padEnd(L)} | ${val.padEnd(R)} |`
const rCentered = (t: string) => {
  const pad = Math.max(0, Math.floor((W - t.length) / 2))
  return `| ${' '.repeat(pad)}${t.padEnd(W - pad)} |`
}

function sectionBlock(title: string, body: string): string[] {
  const rows = wrapText(body, W).map(rFull)
  return [hFull(), rFull(title), hFull(), ...rows]
}

function chatBlock(conversation: string): string[] {
  const rows: string[] = []
  for (const msg of conversation.split('\n\n')) {
    for (const line of wrapText(msg, W)) {
      rows.push(rFull(line))
    }
    rows.push(rFull(''))  // blank separator between messages
  }
  return rows
}

// ── Formatting helpers ────────────────────────────────────────────────

function formatDate(iso: string | undefined): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('da-DK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ── Route ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { messages, masterprompt } = await req.json()

    if (!messages || !masterprompt) {
      return new Response('Missing messages or masterprompt', { status: 400 })
    }

    type Msg = { role: string; content: string; created_at?: string }
    const allMessages = messages as Msg[]
    const userMessages = allMessages.filter((m) => m.role === 'user')

    const date      = formatDate(userMessages[0]?.created_at)
    const userCount = userMessages.length
    const botCount  = allMessages.filter((m) => m.role === 'assistant').length

    const conversation = allMessages
      .map((m) => `${m.role === 'user' ? '[Elev]' : '[ThinkBot]'}: ${m.content}`)
      .join('\n\n')

    // Ask Claude for analysis only
    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Masterprompt:\n${masterprompt}\n\nSamtale:\n${conversation}`,
        },
      ],
    })

    const oversigt = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text.trim() : ''

    // Build the report as an ASCII matrix
    const lines: string[] = [
      hFull(),
      rCentered('THINKBOT SAMTALEEKSPORT'),
      ...sectionBlock('OVERSIGT', oversigt),
      hTwo(),
      rStats('Dato',          date),
      rStats('Elevbeskeder',  String(userCount)),
      rStats('ThinkBot-svar', String(botCount)),
      hFull(),
      rFull('FULD SAMTALE'),
      hFull(),
      ...chatBlock(conversation),
      hFull(),
    ]

    return new Response(lines.join('\n'), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (error) {
    console.error('Generate report error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
