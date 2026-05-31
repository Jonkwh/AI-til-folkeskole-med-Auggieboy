// Requires SUPABASE_SERVICE_ROLE_KEY in environment variables (Vercel + .env.local)
// Get this from Supabase Dashboard → Settings → API → service_role key
// NEVER expose this key to the client

// ─────────────────────────────────────────────────────────────────────────────
// MODULE: app/api/generate-class-report/route.ts
// PURPOSE: Generates a class-wide pedagogical analysis report for the teacher.
//          It fetches all student chat sessions within a chosen date range,
//          formats them into transcripts, and sends them to Claude, which writes
//          a structured three-section report identifying what students understood,
//          where they were confused, and what topics should be revisited in class.
//          The report is returned as a JSON object with three string sections.
// ENDPOINT: POST /api/generate-class-report
// INPUTS:   JSON body with 'from' and 'to' (ISO timestamp strings)
// OUTPUTS:  JSON object: { sessionCount, report: { understood, confusion, nextSteps }, truncated, generatedAt }
// SECURITY: Uses the Supabase service-role key (bypasses row-level security) so
//           it can read all users' sessions. Protected by the teacher password gate in the UI.
// ─────────────────────────────────────────────────────────────────────────────

// Imports the standard Supabase JavaScript client from '@supabase/supabase-js'.
// Unlike '@supabase/ssr', this is used with a secret service-role key to bypass
// row-level security and read data from all users — only safe server-side.
import { createClient } from '@supabase/supabase-js'

// Imports the Anthropic SDK to call Claude for writing the analysis report.
import Anthropic from '@anthropic-ai/sdk'

// 'SYSTEM_PROMPT' is a string constant — the instruction given to Claude for this task.
// It tells Claude to analyse the student conversations and write a structured report
// with exactly three sections, in plain Danish, with specific actionable observations.
const SYSTEM_PROMPT = `Du er en pædagogisk analytiker. Du analyserer samtaler mellem elever og en AI-læringsassistent i en dansk folkeskole. Din opgave er at identificere mønstre på tværs af samtalerne og skrive en kort, konkret rapport til læreren.

Rapporten skal have præcis tre afsnit med disse overskrifter:

FORSTÅET GODT
Skriv 2-4 sætninger om hvilke emner, begreber eller færdigheder eleverne generelt viste forståelse for. Vær specifik — nævn de faktiske emner.

FORVIRRING OG UDFORDRINGER
Skriv 2-4 sætninger om hvor eleverne gik i stå, gentog sig selv, eller viste tegn på forvirring. Nævn konkrete mønstre hvis de findes.

KAN ARBEJDES VIDERE MED
Skriv 2-4 sætninger om huller eller misforståelser der gik igen hos flere elever, og som med fordel kan adresseres i undervisningen.

Skriv kun på dansk. Vær konkret og handlingsorienteret. Undgå generelle udsagn som 'eleverne havde det svært' — sig i stedet præcist hvad de havde svært ved.`

// ─────────────────────────────────────────────────────────────────────────────
// 'POST' is an exported async function — the HTTP POST handler for this route.
// It takes one parameter:
//   - 'req' (type: Request): the incoming HTTP request with JSON body.
// It returns a Response — either a JSON report object (200) or an error (400/500).
//
// ALGORITHM:
//   1. Parse the 'from' and 'to' date strings from the request body.
//   2. Query Supabase for all chat sessions (with messages) in the date range.
//   3. If no sessions found, return immediately with an empty result.
//   4. Cap sessions at 15 (token limit); set 'truncated' flag if more exist.
//   5. Format sessions into labelled transcript strings.
//   6. Send transcripts to Claude; parse the three sections from the response.
//   7. Return the structured JSON report.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    // Parses the HTTP request body.
    // 'from' is a string — an ISO timestamp for the start of the report period (e.g. "2026-05-01T00:00:00.000Z").
    // 'to' is a string — an ISO timestamp for the end of the report period (e.g. "2026-05-31T23:59:59.999Z").
    const { from, to } = await req.json()

    if (!from || !to) {
      // Guard: both date boundaries are required. Return 400 if either is missing.
      return new Response('Missing from or to date', { status: 400 })
    }

    // 'supabase' is a constant holding a Supabase client object configured with the
    // service-role key. Unlike the anon key, the service-role key bypasses row-level
    // security rules, allowing this endpoint to read sessions from ALL users.
    // This is intentional — the teacher needs a class-wide view, not just their own data.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, // String environment variable: the Supabase project URL.
      process.env.SUPABASE_SERVICE_ROLE_KEY! // String environment variable: the secret service-role key. NEVER expose this to the browser.
    )

    // Queries the 'chat_sessions' table for all sessions created within the date range.
    // The '.select' includes a nested 'messages' join so each session's messages are
    // returned in the same query without needing a second database call.
    // 'sessions' will be an array of session objects (or null if the query failed).
    // 'error' will be an object describing the failure (or null on success).
    const { data: sessions, error } = await supabase
      .from('chat_sessions')
      .select('id, masterprompt, created_at, messages(role, content, created_at)')
      .gte('created_at', from)  // Filter: only sessions created ON OR AFTER 'from'.
      .lte('created_at', to)    // Filter: only sessions created ON OR BEFORE 'to'.
      .order('created_at', { ascending: false }) // Sort: newest sessions first.

    if (error) {
      console.error('Supabase error:', error)
      return new Response('Database error', { status: 500 })
    }

    // 'totalCount' is a number — the total number of sessions found in the date range.
    // The '?? 0' (nullish coalescing) returns 0 if 'sessions' is null.
    const totalCount = sessions?.length ?? 0

    if (totalCount === 0) {
      // No sessions found — return an empty result immediately instead of calling Claude.
      return Response.json({
        sessionCount: 0,
        report: null, // Null means "no report was generated" — the UI shows a "no data" message.
        truncated: false, // Boolean: false because there was nothing to truncate.
        generatedAt: new Date().toISOString(),
      })
    }

    // ── Algorithm: Truncation ─────────────────────────────────────────────────
    // Claude has a context window limit. Sending too many long conversations can
    // exceed the token limit or produce poor analysis. The cap is set at 15 sessions.
    // 'truncated' is a boolean — true if more than 15 sessions exist in the period,
    //   meaning only the 15 most recent will be analysed.
    const truncated = totalCount > 15
    // 'usedSessions' is an array — either all sessions, or the first 15 if truncated.
    const usedSessions = truncated ? sessions.slice(0, 15) : sessions

    // ── Algorithm: Build transcript strings ───────────────────────────────────
    // Each session is formatted as a labeled block of text.
    // 'transcripts' is a string — all sessions concatenated with blank lines between them.
    const transcripts = usedSessions
      .map((session, i) => {
        // For each session: sort its messages chronologically (oldest first),
        // then format each as "[Elev]: message" or "[ThinkBot]: message".
        const msgs = (session.messages as { role: string; content: string; created_at: string }[])
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .map((m) => `[${m.role === 'user' ? 'Elev' : 'ThinkBot'}]: ${m.content}`)
          .join('\n')

        // Returns a labelled block for this session, including its masterprompt for context.
        return `--- Samtale ${i + 1} ---\nMasterprompt: ${session.masterprompt}\n${msgs}`
      })
      .join('\n\n') // Separates each session block with a blank line.

    // 'truncationNote' is a string — an empty string, or a Danish note explaining that
    // only 15 of a larger number of sessions were included. Appended to the Claude prompt
    // so Claude knows the analysis may be partial.
    const truncationNote = truncated
      ? `\n\nBemærk: Kun de 15 nyeste samtaler er inkluderet ud af ${totalCount} i alt.`
      : ''

    // 'userMessage' is a string — the full prompt text sent to Claude as the user message.
    // It includes the session count, date range, all formatted transcripts, and the truncation note.
    const userMessage = `Her er ${usedSessions.length} elevsamtaler fra perioden ${from} til ${to}:\n\n${transcripts}${truncationNote}`

    // 'anthropic' is a constant holding an Anthropic client object, created here
    // (not at module level) to match the pattern in other route files.
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Sends all session transcripts to Claude and waits for the three-section analysis.
    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500, // Number: three sections of 2–4 sentences each — 1500 tokens is sufficient.
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    // 'rawText' is a string — Claude's full response text, containing all three sections
    // separated by their heading strings (FORSTÅET GODT, FORVIRRING OG UDFORDRINGER, etc.).
    const rawText = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : ''

    // ── Algorithm: Parse the three sections ──────────────────────────────────
    // 'extractSection' is an arrow function (a compact function syntax) that extracts
    // one section of text from Claude's response by locating its heading.
    // It takes three parameters:
    //   - 'text' (string): the full response text to search within
    //   - 'heading' (string): the exact heading string that marks the start of this section
    //   - 'nextHeading' (string, optional): the heading of the following section, used to
    //      find the end of this section; if absent, the section runs to the end of the text
    // It returns a string: the trimmed content of the section (empty string if not found).
    const extractSection = (text: string, heading: string, nextHeading?: string): string => {
      const start = text.indexOf(heading) // Number: the character position where the heading begins.
      if (start === -1) return '' // Guard: heading not found — return empty string.
      const contentStart = start + heading.length // Number: position immediately after the heading.
      // 'end' is a number — the position of the next heading (or end of string if no next heading).
      const end = nextHeading ? text.indexOf(nextHeading, contentStart) : text.length
      return text.slice(contentStart, end === -1 ? text.length : end).trim()
    }

    // 'understood', 'confusion', 'nextSteps' are string variables — the three extracted sections.
    const understood = extractSection(rawText, 'FORSTÅET GODT', 'FORVIRRING OG UDFORDRINGER')
    const confusion  = extractSection(rawText, 'FORVIRRING OG UDFORDRINGER', 'KAN ARBEJDES VIDERE MED')
    const nextSteps  = extractSection(rawText, 'KAN ARBEJDES VIDERE MED')

    // Returns the structured JSON result. The UI renders each section as a separate card.
    return Response.json({
      sessionCount: usedSessions.length, // Number: how many sessions were actually analysed.
      report: { understood, confusion, nextSteps }, // Object with three string properties.
      truncated, // Boolean: whether the 15-session cap was applied.
      generatedAt: new Date().toISOString(), // String: ISO timestamp shown at the bottom of the report.
    })

  } catch (error) {
    console.error('Generate class report error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
