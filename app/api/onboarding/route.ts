import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const ONBOARDING_SYSTEM_PROMPT = `Du genererer korte onboarding-spørgsmålsforløb til en pædagogisk chatbot, der bruges af elever i den danske folkeskoles udskoling. Du modtager en beskrivelse af bottens rolle, elevens klassetrin, fag og eventuelle begrænsninger.

Baseret på denne beskrivelse skal du generere præcis 2 sekventielle onboarding-spørgsmål, der hjælper botten med at forstå elevens situation, inden samtalen begynder. Spørgsmålene skal være direkte relevante for den specifikke rolle og det specifikke fag — aldrig generiske.

Regler:
- Alle spørgsmål og svarmuligheder skal være på dansk
- Hvert spørgsmål skal have 3–4 korte svarmuligheder
- Svarmulighederne skal være specifikke for rollen og faget — ikke udskiftelige på tværs af fag
- Det andet spørgsmål skal følge logisk af det første
- Henvis aldrig til "masterprompt", "systemprompt" eller tekniske termer
- Svar kun med valid JSON. Ingen prosa, ingen markdown, ingen backticks.

Format:
{
  "steps": [
    { "question": "...", "options": ["...", "...", "..."] },
    { "question": "...", "options": ["...", "...", "..."] }
  ]
}`

const FALLBACK = {
  steps: [
    {
      question: 'Hvad arbejder du med i dag?',
      options: ['Jeg er lige startet', 'Jeg er i gang, men sidder fast', 'Jeg har et udkast'],
    },
    {
      question: 'Hvad ville hjælpe dig mest?',
      options: ['Forstå opgaven', 'Komme i gang', 'Tjekke mit arbejde'],
    },
  ],
}

const STEP2_SYSTEM_PROMPT = `You generate a single follow-up question for an educational chatbot used by Danish lower-secondary school students. You are given a masterprompt describing the bot's role, grade, subject, and restrictions, and the student's first message.

Generate exactly 1 follow-up question with 3–4 short answer options in Danish that are directly relevant to what the student wrote. The question should help the bot understand how best to help the student with what they specifically asked or said.

Rules:
- Question and options must be in Danish
- Options must be specific to the student's actual message — not generic
- Never reference "masterprompt", "system prompt", or any technical terms
- Respond only with valid JSON. No prose, no markdown fences, no backticks.

Format:
{
  "question": "...",
  "options": ["...", "...", "..."]
}`

const STEP2_FALLBACK = {
  question: 'Hvad ville hjælpe dig mest?',
  options: ['Forstå opgaven bedre', 'Komme i gang med at skrive', 'Få et konkret eksempel'],
}

export async function POST(req: Request) {
  try {
    const { systemPrompt, step1Answer } = await req.json()

    // ── Step 2 dynamic generation ───────────────────────────────────────────
    if (step1Answer) {
      if (!systemPrompt) {
        return new Response(JSON.stringify(STEP2_FALLBACK), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const step2Response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        system: STEP2_SYSTEM_PROMPT + '\n\nMasterprompt:\n' + systemPrompt,
        messages: [{ role: 'user', content: step1Answer }],
      })

      const step2Text =
        step2Response.content[0].type === 'text' ? step2Response.content[0].text.trim() : null

      if (!step2Text) throw new Error('No text content in step 2 response')

      const step2Parsed = JSON.parse(step2Text)

      return new Response(JSON.stringify(step2Parsed), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Initial two-step generation ─────────────────────────────────────────
    if (!systemPrompt) {
      return new Response(JSON.stringify(FALLBACK), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: ONBOARDING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: systemPrompt }],
    })

    const text =
      aiResponse.content[0].type === 'text' ? aiResponse.content[0].text.trim() : null

    if (!text) throw new Error('No text content in onboarding response')

    const parsed = JSON.parse(text)

    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Onboarding API error:', error)
    return new Response(JSON.stringify(FALLBACK), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
