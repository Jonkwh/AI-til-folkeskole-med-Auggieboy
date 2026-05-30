// Imports the Anthropic SDK to call Claude for generating the OVERSIGT (overview) paragraph.
import Anthropic from '@anthropic-ai/sdk'

// Creates the Anthropic client using the secret API key from the server environment.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Claude only generates the OVERSIGT paragraph — all structure is built in code.
// The prompt instructs Claude to write plain Danish prose with no markdown formatting.
const SYSTEM_PROMPT = `Du er en assistent der hjælper lærere med at forstå, hvordan elever har brugt et AI-værktøj kaldet ThinkBot.

Skriv 3-5 sætninger i klart dansk om hvad eleven arbejdede med og hvilken slags hjælp de bad om. Ingen overskrift, ingen markdown, ingen emojis, ingen punktopstillinger — kun løbende tekst.`

// ── Plain-text formatting helpers ────────────────────────────────────

// Returns a section heading underlined with dashes — used to separate sections in the plain-text report.
function sectionHeading(title: string): string {
  return `\n\n${title}\n${'-'.repeat(title.length)}\n`
}

// Returns a dot-leader line: "Label .......... value" — used for the stats table in the report.
function dotLeader(label: string, value: string, col = 40): string {
  // e.g. "Dato ............................ 18. marts 2026"
  const dots = '.'.repeat(Math.max(1, col - label.length - 2))
  return `${label} ${dots} ${value}`
}

// Converts an ISO timestamp string to a human-readable Danish date (e.g. "18. marts 2026").
// Returns '-' if the timestamp is missing or undefined.
function formatDate(iso: string | undefined): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('da-DK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ── Route ─────────────────────────────────────────────────────────────

// API route handler for POST /api/generate-report.
// Accepts the conversation messages and masterprompt, generates a plain-text report, and returns it.
export async function POST(req: Request) {
  try {
    // Parses the incoming JSON body to extract the messages array and the masterprompt string.
    const { messages, masterprompt } = await req.json()

    if (!messages || !masterprompt) {
      // Returns a 400 Bad Request if either required field is missing.
      return new Response('Missing messages or masterprompt', { status: 400 })
    }

    // Type annotation for each message in the conversation — role, text content, and optional timestamp.
    type Msg = { role: string; content: string; created_at?: string }
    const allMessages = messages as Msg[]
    // Filters to only the student's messages, used for counting and extracting the session start date.
    const userMessages = allMessages.filter((m) => m.role === 'user')

    // Extracts the date from the student's first message to show in the report header.
    const date      = formatDate(userMessages[0]?.created_at)
    const userCount = userMessages.length // Total number of student messages.
    const botCount  = allMessages.filter((m) => m.role === 'assistant').length // Total number of bot responses.

    // Formats the full conversation as labelled plain text to pass to Claude as context.
    const conversation = allMessages
      .map((m) => `${m.role === 'user' ? '[Elev]' : '[ThinkBot]'}: ${m.content}`)
      .join('\n\n')

    // Ask Claude for the OVERSIGT paragraph only — all other report sections are assembled in code below.
    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          // Provides both the masterprompt (what the bot was configured to do) and the full conversation as context.
          content: `Masterprompt:\n${masterprompt}\n\nSamtale:\n${conversation}`,
        },
      ],
    })

    // Extracts the text from Claude's response. Falls back to empty string if the response has no text content.
    const oversigt = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text.trim() : ''

    // Build the full chat block: speaker label on one line, content on the next.
    // This differs from the API-format `conversation` above — here each speaker gets its own line.
    const chatLines = allMessages
      .map((m) => {
        const label = m.role === 'user' ? '[Elev]' : '[ThinkBot]'
        return `${label}\n${m.content}`
      })
      .join('\n\n')

    // Assembles all sections into the final plain-text report string.
    const report = [
      'THINKBOT SAMTALEEKSPORT', // Report title.
      '-'.repeat('THINKBOT SAMTALEEKSPORT'.length), // Underline matching the title length.
      date, // Date of the session shown directly below the title.
      sectionHeading('OVERSIGT'), // Section divider for the AI-generated summary.
      oversigt, // The 3-5 sentence summary written by Claude.
      sectionHeading('SAMTALESTATISTIK'), // Section divider for the message count stats.
      dotLeader('Dato',          date), // Date row in the stats table.
      dotLeader('Elevbeskeder',  String(userCount)), // Count of student messages.
      dotLeader('ThinkBot-svar', String(botCount)), // Count of bot responses.
      sectionHeading('FULD SAMTALE'), // Section divider for the raw conversation transcript.
      chatLines, // The full conversation in readable format.
    ].join('\n')

    // Returns the assembled report as a plain-text HTTP response.
    return new Response(report, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (error) {
    console.error('Generate report error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
