import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Claude only generates the OVERSIGT paragraph — all structure is built in code.
const SYSTEM_PROMPT = `Du er en assistent der hjælper lærere med at forstå, hvordan elever har brugt et AI-værktøj kaldet ThinkBot.

Skriv 3-5 sætninger i klart dansk om hvad eleven arbejdede med og hvilken slags hjælp de bad om. Ingen overskrift, ingen markdown, ingen emojis, ingen punktopstillinger — kun løbende tekst.`

// ── Plain-text formatting helpers ────────────────────────────────────

function sectionHeading(title: string): string {
  return `\n\n${title}\n${'-'.repeat(title.length)}\n`
}

function dotLeader(label: string, value: string, col = 40): string {
  // e.g. "Dato ............................ 18. marts 2026"
  const dots = '.'.repeat(Math.max(1, col - label.length - 2))
  return `${label} ${dots} ${value}`
}

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

    // Ask Claude for the OVERSIGT paragraph only
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

    // Build the full chat block: speaker label on one line, content on the next
    const chatLines = allMessages
      .map((m) => {
        const label = m.role === 'user' ? '[Elev]' : '[ThinkBot]'
        return `${label}\n${m.content}`
      })
      .join('\n\n')

    // Assemble the report
    const report = [
      'THINKBOT SAMTALEEKSPORT',
      '-'.repeat('THINKBOT SAMTALEEKSPORT'.length),
      date,
      sectionHeading('OVERSIGT'),
      oversigt,
      sectionHeading('SAMTALESTATISTIK'),
      dotLeader('Dato',          date),
      dotLeader('Elevbeskeder',  String(userCount)),
      dotLeader('ThinkBot-svar', String(botCount)),
      sectionHeading('FULD SAMTALE'),
      chatLines,
    ].join('\n')

    return new Response(report, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (error) {
    console.error('Generate report error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
