// Requires SUPABASE_SERVICE_ROLE_KEY in environment variables (Vercel + .env.local)
// Get this from Supabase Dashboard → Settings → API → service_role key
// NEVER expose this key to the client

// Imports the standard Supabase JS client — used here with the service role key to bypass row-level security.
import { createClient } from '@supabase/supabase-js'
// Imports the Anthropic SDK to call Claude for generating the class-level pedagogical analysis report.
import Anthropic from '@anthropic-ai/sdk'

// Instructs Claude to analyse multiple student conversations and produce a structured three-section report.
// The report is intended for the teacher — it identifies patterns across the entire class, not individual students.
const SYSTEM_PROMPT = `Du er en pædagogisk analytiker. Du analyserer samtaler mellem elever og en AI-læringsassistent i en dansk folkeskole. Din opgave er at identificere mønstre på tværs af samtalerne og skrive en kort, konkret rapport til læreren.

Rapporten skal have præcis tre afsnit med disse overskrifter:

FORSTÅET GODT
Skriv 2-4 sætninger om hvilke emner, begreber eller færdigheder eleverne generelt viste forståelse for. Vær specifik — nævn de faktiske emner.

FORVIRRING OG UDFORDRINGER
Skriv 2-4 sætninger om hvor eleverne gik i stå, gentog sig selv, eller viste tegn på forvirring. Nævn konkrete mønstre hvis de findes.

KAN ARBEJDES VIDERE MED
Skriv 2-4 sætninger om huller eller misforståelser der gik igen hos flere elever, og som med fordel kan adresseres i undervisningen.

Skriv kun på dansk. Vær konkret og handlingsorienteret. Undgå generelle udsagn som 'eleverne havde det svært' — sig i stedet præcist hvad de havde svært ved.`

// API route handler for POST /api/generate-class-report.
// Fetches all chat sessions in a date range, passes their transcripts to Claude, and returns a structured report.
export async function POST(req: Request) {
  try {
    // Parses the request body to extract the start and end dates for the report period.
    const { from, to } = await req.json()

    if (!from || !to) {
      // Returns a 400 Bad Request if either date boundary is missing.
      return new Response('Missing from or to date', { status: 400 })
    }

    // Service role client — bypasses RLS to read all users' sessions across the entire database.
    // This is safe here because the endpoint is protected by a teacher-only password gate in the UI.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // Secret key — never sent to the browser.
    )

    // Fetch all sessions in the date range, with their messages joined in a single query.
    const { data: sessions, error } = await supabase
      .from('chat_sessions')
      .select('id, masterprompt, created_at, messages(role, content, created_at)')
      .gte('created_at', from) // Filters sessions created on or after the 'from' date.
      .lte('created_at', to) // Filters sessions created on or before the 'to' date.
      .order('created_at', { ascending: false }) // Newest sessions first.

    if (error) {
      console.error('Supabase error:', error)
      return new Response('Database error', { status: 500 })
    }

    // Defaults to 0 if the query returned no data.
    const totalCount = sessions?.length ?? 0

    if (totalCount === 0) {
      // Returns an empty result immediately — no point calling Claude with nothing to analyse.
      return Response.json({
        sessionCount: 0,
        report: null,
        truncated: false,
        generatedAt: new Date().toISOString(),
      })
    }

    // Caps the number of sessions sent to Claude at 15 to stay within token limits.
    const truncated = totalCount > 15
    const usedSessions = truncated ? sessions.slice(0, 15) : sessions

    // Build transcript string — each session is formatted as a labelled conversation block.
    const transcripts = usedSessions
      .map((session, i) => {
        // Sorts each session's messages chronologically and formats them as "[Elev]:" / "[ThinkBot]:" lines.
        const msgs = (session.messages as { role: string; content: string; created_at: string }[])
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .map((m) => `[${m.role === 'user' ? 'Elev' : 'ThinkBot'}]: ${m.content}`)
          .join('\n')

        return `--- Samtale ${i + 1} ---\nMasterprompt: ${session.masterprompt}\n${msgs}`
      })
      .join('\n\n')

    // Appends a note when not all sessions fit in the context window, so Claude knows the analysis is partial.
    const truncationNote = truncated
      ? `\n\nBemærk: Kun de 15 nyeste samtaler er inkluderet ud af ${totalCount} i alt.`
      : ''

    // Assembles the full user message sent to Claude, including all transcripts and the date range for context.
    const userMessage = `Her er ${usedSessions.length} elevsamtaler fra perioden ${from} til ${to}:\n\n${transcripts}${truncationNote}`

    // Creates the Anthropic client with the secret API key.
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Sends all transcripts to Claude and asks it to produce the three-section analysis.
    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500, // Three sections of 2-4 sentences each — 1500 tokens is sufficient.
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    // Extracts the raw text from Claude's response (the three sections are separated by their headings).
    const rawText = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : ''

    // Parses the three sections out of Claude's response by locating each heading string.
    // Returns the text between the given heading and the next heading (or end of string).
    const extractSection = (text: string, heading: string, nextHeading?: string): string => {
      const start = text.indexOf(heading) // Finds where this section's heading begins.
      if (start === -1) return '' // Returns empty string if the heading wasn't found.
      const contentStart = start + heading.length // Moves past the heading to get to the content.
      const end = nextHeading ? text.indexOf(nextHeading, contentStart) : text.length
      return text.slice(contentStart, end === -1 ? text.length : end).trim()
    }

    // Extracts each of the three report sections from Claude's output.
    const understood = extractSection(rawText, 'FORSTÅET GODT', 'FORVIRRING OG UDFORDRINGER')
    const confusion = extractSection(rawText, 'FORVIRRING OG UDFORDRINGER', 'KAN ARBEJDES VIDERE MED')
    const nextSteps = extractSection(rawText, 'KAN ARBEJDES VIDERE MED')

    // Returns the structured report as JSON so the UI can render each section in its own card.
    return Response.json({
      sessionCount: usedSessions.length, // How many sessions were actually analysed (may be less than total if truncated).
      report: { understood, confusion, nextSteps },
      truncated, // Tells the UI to show a disclaimer if only the most recent 15 sessions were used.
      generatedAt: new Date().toISOString(), // Timestamp shown at the bottom of the report.
    })
  } catch (error) {
    console.error('Generate class report error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
