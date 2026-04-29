// Requires SUPABASE_SERVICE_ROLE_KEY in environment variables (Vercel + .env.local)
// Get this from Supabase Dashboard → Settings → API → service_role key
// NEVER expose this key to the client

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const SYSTEM_PROMPT = `Du er en pædagogisk analytiker. Du analyserer samtaler mellem elever og en AI-læringsassistent i en dansk folkeskole. Din opgave er at identificere mønstre på tværs af samtalerne og skrive en kort, konkret rapport til læreren.

Rapporten skal have præcis tre afsnit med disse overskrifter:

FORSTÅET GODT
Skriv 2-4 sætninger om hvilke emner, begreber eller færdigheder eleverne generelt viste forståelse for. Vær specifik — nævn de faktiske emner.

FORVIRRING OG UDFORDRINGER
Skriv 2-4 sætninger om hvor eleverne gik i stå, gentog sig selv, eller viste tegn på forvirring. Nævn konkrete mønstre hvis de findes.

KAN ARBEJDES VIDERE MED
Skriv 2-4 sætninger om huller eller misforståelser der gik igen hos flere elever, og som med fordel kan adresseres i undervisningen.

Skriv kun på dansk. Vær konkret og handlingsorienteret. Undgå generelle udsagn som 'eleverne havde det svært' — sig i stedet præcist hvad de havde svært ved.`

export async function POST(req: Request) {
  try {
    const { from, to } = await req.json()

    if (!from || !to) {
      return new Response('Missing from or to date', { status: 400 })
    }

    // Service role client — bypasses RLS to read all users' sessions
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch all sessions in the date range, with their messages
    const { data: sessions, error } = await supabase
      .from('chat_sessions')
      .select('id, masterprompt, created_at, messages(role, content, created_at)')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Supabase error:', error)
      return new Response('Database error', { status: 500 })
    }

    const totalCount = sessions?.length ?? 0

    if (totalCount === 0) {
      return Response.json({
        sessionCount: 0,
        report: null,
        truncated: false,
        generatedAt: new Date().toISOString(),
      })
    }

    const truncated = totalCount > 15
    const usedSessions = truncated ? sessions.slice(0, 15) : sessions

    // Build transcript string
    const transcripts = usedSessions
      .map((session, i) => {
        const msgs = (session.messages as { role: string; content: string; created_at: string }[])
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .map((m) => `[${m.role === 'user' ? 'Elev' : 'ThinkBot'}]: ${m.content}`)
          .join('\n')

        return `--- Samtale ${i + 1} ---\nMasterprompt: ${session.masterprompt}\n${msgs}`
      })
      .join('\n\n')

    const truncationNote = truncated
      ? `\n\nBemærk: Kun de 15 nyeste samtaler er inkluderet ud af ${totalCount} i alt.`
      : ''

    const userMessage = `Her er ${usedSessions.length} elevsamtaler fra perioden ${from} til ${to}:\n\n${transcripts}${truncationNote}`

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1500,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    })

    const rawText = aiResponse.choices[0]?.message?.content ?? ''

    // Parse the three sections
    const extractSection = (text: string, heading: string, nextHeading?: string): string => {
      const start = text.indexOf(heading)
      if (start === -1) return ''
      const contentStart = start + heading.length
      const end = nextHeading ? text.indexOf(nextHeading, contentStart) : text.length
      return text.slice(contentStart, end === -1 ? text.length : end).trim()
    }

    const understood = extractSection(rawText, 'FORSTÅET GODT', 'FORVIRRING OG UDFORDRINGER')
    const confusion = extractSection(rawText, 'FORVIRRING OG UDFORDRINGER', 'KAN ARBEJDES VIDERE MED')
    const nextSteps = extractSection(rawText, 'KAN ARBEJDES VIDERE MED')

    return Response.json({
      sessionCount: usedSessions.length,
      report: { understood, confusion, nextSteps },
      truncated,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Generate class report error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
