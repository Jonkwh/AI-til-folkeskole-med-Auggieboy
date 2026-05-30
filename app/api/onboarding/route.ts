// Imports the Anthropic SDK to call Claude for generating personalised onboarding questions.
import Anthropic from '@anthropic-ai/sdk'

// Creates the Anthropic client using the secret API key from the server environment.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Instructs Claude to generate exactly 2 onboarding questions tailored to the bot's role and subject.
// The questions help the bot understand the student's situation before the main conversation begins.
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

// Generic fallback onboarding questions used when the API call fails or no masterprompt is provided.
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

// Instructs Claude to generate a single dynamic follow-up question based on the student's first answer.
// Used when the student typed free text at step 1 instead of selecting a card option.
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

// Generic fallback for step 2 when the dynamic generation fails or returns an unexpected format.
const STEP2_FALLBACK = {
  question: 'Hvad ville hjælpe dig mest?',
  options: ['Forstå opgaven bedre', 'Komme i gang med at skrive', 'Få et konkret eksempel'],
}

// API route handler for POST /api/onboarding.
// Has two modes: initial generation (2 questions) and dynamic step-2 generation (1 tailored follow-up).
export async function POST(req: Request) {
  try {
    // Parses the request body. step1Answer is only present for dynamic step-2 generation.
    const { systemPrompt, step1Answer } = await req.json()

    // ── Step 2 dynamic generation ───────────────────────────────────────────
    // When step1Answer is provided, the client wants a single tailored follow-up question.
    if (step1Answer) {
      if (!systemPrompt) {
        // Returns the generic step-2 fallback if no masterprompt context is available.
        return new Response(JSON.stringify(STEP2_FALLBACK), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Calls Claude with the step-2 prompt, appending the masterprompt as context.
      // The student's first answer is sent as the user message so Claude can tailor the question.
      const step2Response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300, // The response is a single question with 3-4 options — very short.
        system: STEP2_SYSTEM_PROMPT + '\n\nMasterprompt:\n' + systemPrompt,
        messages: [{ role: 'user', content: step1Answer }],
      })

      // Extracts the text from Claude's response or null if the response has no text content.
      const step2Text =
        step2Response.content[0].type === 'text' ? step2Response.content[0].text.trim() : null

      if (!step2Text) throw new Error('No text content in step 2 response')

      // Parses the JSON returned by Claude into the { question, options } object shape.
      const step2Parsed = JSON.parse(step2Text)

      return new Response(JSON.stringify(step2Parsed), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Initial two-step generation ─────────────────────────────────────────
    // When no step1Answer is present, the client wants the initial pair of onboarding questions.
    if (!systemPrompt) {
      // Returns the generic two-step fallback if no masterprompt is available to personalise with.
      return new Response(JSON.stringify(FALLBACK), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Calls Claude with the full masterprompt to generate 2 role- and subject-specific onboarding questions.
    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400, // Two questions with 3-4 short options each — no more than ~400 tokens needed.
      system: ONBOARDING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: systemPrompt }],
    })

    // Extracts the JSON text from Claude's response.
    const text =
      aiResponse.content[0].type === 'text' ? aiResponse.content[0].text.trim() : null

    if (!text) throw new Error('No text content in onboarding response')

    // Parses the JSON into the { steps: [...] } object shape expected by the client.
    const parsed = JSON.parse(text)

    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    // On any error (API failure, JSON parse error, etc.) return the safe generic fallback so onboarding never breaks.
    console.error('Onboarding API error:', error)
    return new Response(JSON.stringify(FALLBACK), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
