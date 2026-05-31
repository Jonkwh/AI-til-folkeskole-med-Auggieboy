// ─────────────────────────────────────────────────────────────────────────────
// MODULE: app/api/generate-report/route.ts
// PURPOSE: Generates a formatted plain-text report for a single student chat session.
//          It receives the full conversation history and the teacher's masterprompt,
//          asks Claude to write a short OVERSIGT (overview) paragraph summarising
//          what the student worked on, and then assembles that paragraph together
//          with message statistics and the full chat transcript into a single
//          plain-text document that can be previewed and emailed to the teacher.
// ENDPOINT: POST /api/generate-report
// INPUTS:   JSON body with 'messages' (array) and 'masterprompt' (string)
// OUTPUTS:  A plain-text string (the formatted report) with Content-Type text/plain
// ─────────────────────────────────────────────────────────────────────────────

// Imports the Anthropic SDK to call Claude for writing the OVERSIGT paragraph.
import Anthropic from '@anthropic-ai/sdk'

// 'anthropic' is a constant holding an Anthropic client object.
// It is created at module level so the same client instance is reused across requests.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // String environment variable: the secret Anthropic API key.
})

// 'SYSTEM_PROMPT' is a string constant — the instruction given to Claude for this specific task.
// It tells Claude to write 3–5 sentences in plain Danish about the student session,
// with no markdown, headings, or special formatting. Claude is only generating the
// OVERSIGT paragraph; all other report sections are built in code below.
const SYSTEM_PROMPT = `Du er en assistent der hjælper lærere med at forstå, hvordan elever har brugt et AI-værktøj kaldet ThinkBot.

Skriv 3-5 sætninger i klart dansk om hvad eleven arbejdede med og hvilken slags hjælp de bad om. Ingen overskrift, ingen markdown, ingen emojis, ingen punktopstillinger — kun løbende tekst.`

// ─────────────────────────────────────────────────────────────────────────────
// PLAIN-TEXT FORMATTING HELPERS
// These three functions produce the building blocks of the final report text.
// They use plain-text techniques (dashes, dots) instead of HTML or markdown
// so the report is readable in any email client or text editor.
// ─────────────────────────────────────────────────────────────────────────────

// 'sectionHeading' is a function that takes one parameter:
//   - 'title' (string): the section name (e.g. "OVERSIGT")
// It returns a string: the title on one line followed by a line of dashes of the same length.
// Example output: "\n\nOVERSIGT\n--------\n"
function sectionHeading(title: string): string {
  return `\n\n${title}\n${'-'.repeat(title.length)}\n`
  // '-'.repeat(title.length) creates a string of dashes exactly as long as the title.
}

// 'dotLeader' is a function that takes three parameters:
//   - 'label' (string): the left-side label (e.g. "Dato")
//   - 'value' (string): the right-side value (e.g. "18. marts 2026")
//   - 'col' (number, optional, default 40): the total column width before the value
// It returns a string: a dot-leader line like "Dato ................... 18. marts 2026"
// This creates a visually aligned stats table in the plain-text report.
function dotLeader(label: string, value: string, col = 40): string {
  // 'dots' is a string of '.' characters. Its length is calculated so the label,
  // dots, and value together span exactly 'col' characters.
  // Math.max(1, ...) ensures there is always at least one dot even for very long labels.
  const dots = '.'.repeat(Math.max(1, col - label.length - 2))
  return `${label} ${dots} ${value}`
}

// 'formatDate' is a function that takes one optional parameter:
//   - 'iso' (string or undefined): an ISO 8601 timestamp like "2026-05-18T10:30:00Z"
// It returns a string: a human-readable Danish date like "18. maj 2026".
// If 'iso' is undefined or missing, it returns the string '-' as a safe placeholder.
function formatDate(iso: string | undefined): string {
  if (!iso) return '-' // Guard: returns a dash if no timestamp was provided.
  // 'toLocaleDateString' is a built-in JavaScript date method. 'da-DK' is the Danish locale code.
  return new Date(iso).toLocaleDateString('da-DK', {
    year: 'numeric', // Shows the full year (e.g. "2026")
    month: 'long',   // Shows the full month name (e.g. "maj")
    day: 'numeric',  // Shows the day number (e.g. "18.")
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE HANDLER
// ─────────────────────────────────────────────────────────────────────────────

// 'POST' is an exported async function — the HTTP POST handler for this route.
// Next.js calls it automatically when a POST request arrives at /api/generate-report.
// It takes one parameter:
//   - 'req' (type: Request): the incoming HTTP request containing the conversation data.
// It returns a Response — either the plain-text report (200) or an error message (400/500).
export async function POST(req: Request) {
  try {
    // Parses the HTTP request body from JSON.
    // 'messages' is an array of message objects (role + content + optional timestamp).
    // 'masterprompt' is a string — the teacher's configured system prompt for this session.
    const { messages, masterprompt } = await req.json()

    if (!messages || !masterprompt) {
      // Guard: both fields are required. Return 400 if either is missing.
      return new Response('Missing messages or masterprompt', { status: 400 })
    }

    // 'Msg' is a TypeScript type (a named object shape, not a class or function).
    // It describes what each message object looks like: a 'role' string, a 'content'
    // string, and an optional 'created_at' timestamp string.
    type Msg = { role: string; content: string; created_at?: string }

    // 'allMessages' is an array of Msg objects — the full conversation history
    // cast from the raw parsed JSON into the known Msg type.
    const allMessages = messages as Msg[]

    // 'userMessages' is an array of Msg objects — a filtered subset containing only
    // messages where 'role' equals 'user' (i.e. the student's messages, not the bot's).
    // '.filter' is an array method that returns a new array of items that pass a test.
    const userMessages = allMessages.filter((m) => m.role === 'user')

    // 'date' is a string — the formatted date of the first student message,
    // used as the session date in the report header.
    const date = formatDate(userMessages[0]?.created_at)
    // 'userCount' is a number — the total count of student messages in the session.
    const userCount = userMessages.length
    // 'botCount' is a number — the total count of bot (assistant) responses.
    const botCount = allMessages.filter((m) => m.role === 'assistant').length

    // 'conversation' is a string — the entire conversation formatted as labelled lines,
    // used as context when asking Claude to write the OVERSIGT paragraph.
    // '.map' transforms each message object into a formatted string; '.join' merges them.
    const conversation = allMessages
      .map((m) => `${m.role === 'user' ? '[Elev]' : '[ThinkBot]'}: ${m.content}`)
      .join('\n\n')

    // ── Algorithm: Ask Claude for the OVERSIGT paragraph ─────────────────────
    // Sends the masterprompt and the full conversation to Claude with a brief
    // instruction to write 3-5 sentences in plain Danish summarising the session.
    // Claude's output is a single string (no structure needed — just flowing text).
    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048, // Number: the maximum number of tokens Claude can generate in this response.
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          // Provides the masterprompt (bot configuration) and the full transcript as context.
          content: `Masterprompt:\n${masterprompt}\n\nSamtale:\n${conversation}`,
        },
      ],
    })

    // 'oversigt' is a string — the 3–5 sentence paragraph written by Claude.
    // The ternary checks the content type before reading the text, because the
    // Anthropic API could theoretically return non-text content (e.g. tool use).
    const oversigt = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text.trim() : ''

    // 'chatLines' is a string — the full conversation formatted differently from
    // 'conversation' above: here each speaker label is on its own line, making the
    // transcript easier to read in a plain-text email.
    const chatLines = allMessages
      .map((m) => {
        const label = m.role === 'user' ? '[Elev]' : '[ThinkBot]' // String: the speaker label.
        return `${label}\n${m.content}` // Puts the label on one line and the message text on the next.
      })
      .join('\n\n')

    // ── Algorithm: Assemble the final plain-text report ───────────────────────
    // Builds an array of strings (each representing one section of the report)
    // and joins them with '\n' to form the complete report document.
    // 'report' is a string — the fully assembled plain-text report.
    const report = [
      'THINKBOT SAMTALEEKSPORT',                      // String: report title.
      '-'.repeat('THINKBOT SAMTALEEKSPORT'.length),   // String: underline matching the title length.
      date,                                           // String: the session date.
      sectionHeading('OVERSIGT'),                     // String: section divider for the AI summary.
      oversigt,                                       // String: the 3–5 sentence summary from Claude.
      sectionHeading('SAMTALESTATISTIK'),             // String: section divider for the stats table.
      dotLeader('Dato',          date),               // String: dot-leader row for the date.
      dotLeader('Elevbeskeder',  String(userCount)),  // String: dot-leader row for student message count.
      dotLeader('ThinkBot-svar', String(botCount)),   // String: dot-leader row for bot response count.
      sectionHeading('FULD SAMTALE'),                 // String: section divider for the transcript.
      chatLines,                                      // String: the full conversation transcript.
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
