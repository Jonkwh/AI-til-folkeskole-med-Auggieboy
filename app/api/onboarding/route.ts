// ─────────────────────────────────────────────────────────────────────────────
// MODULE: app/api/onboarding/route.ts
// PURPOSE: Generates personalised onboarding questions shown to the student at the
//          start of every new chat session. Before the student types anything, the
//          app shows 2 multiple-choice questions so the bot understands their starting
//          point. This module has two operating modes:
//
//          MODE 1 (initial load): When called with just 'systemPrompt', it returns
//            two pre-generated questions tailored to the bot's role and subject.
//          MODE 2 (dynamic step 2): When called with 'systemPrompt' AND 'step1Answer',
//            it generates a single follow-up question personalised to what the
//            student actually typed or selected at step 1.
//
//          Both modes fall back to safe generic questions if the AI call fails.
// ENDPOINT: POST /api/onboarding
// ─────────────────────────────────────────────────────────────────────────────

// Imports the Anthropic SDK to call Claude for generating the onboarding questions.
import Anthropic from '@anthropic-ai/sdk'

// 'anthropic' is a constant holding an Anthropic client object, created at module
// level so it is shared across requests rather than recreated each time.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // String environment variable: the secret Anthropic API key.
})

// 'ONBOARDING_SYSTEM_PROMPT' is a string constant — the instruction given to Claude
// for MODE 1 (initial two-question generation). It tells Claude to produce exactly
// 2 sequential questions with 3–4 Danish options each, tailored to the bot's role
// and subject, and to respond only with valid JSON (no prose or markdown).
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

// 'FALLBACK' is a constant object — the generic two-step onboarding questions used
// when the AI call fails or no masterprompt is available to personalise with.
// It has one property: 'steps', which is an array of two objects, each with a
// 'question' string and an 'options' array of strings.
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

// 'STEP2_SYSTEM_PROMPT' is a string constant — the instruction given to Claude for
// MODE 2 (dynamic step 2). It tells Claude to generate exactly 1 follow-up question
// with 3–4 options that respond directly to what the student wrote at step 1.
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

// 'STEP2_FALLBACK' is a constant object — the generic single-question fallback for
// MODE 2. It has a 'question' string and an 'options' array of strings.
const STEP2_FALLBACK = {
  question: 'Hvad ville hjælpe dig mest?',
  options: ['Forstå opgaven bedre', 'Komme i gang med at skrive', 'Få et konkret eksempel'],
}

// ─────────────────────────────────────────────────────────────────────────────
// 'POST' is an exported async function — the HTTP POST handler for this route.
// Next.js calls it when a POST request arrives at /api/onboarding.
// It takes one parameter:
//   - 'req' (type: Request): the incoming HTTP request with JSON body.
// It returns a Response — either a JSON object of questions (200) or an error (400/500).
//
// ALGORITHM (branching by presence of 'step1Answer'):
//   1. Parse the request body to get 'systemPrompt' and 'step1Answer'.
//   2. If 'step1Answer' is present → MODE 2: generate one tailored follow-up question.
//   3. If only 'systemPrompt' is present → MODE 1: generate two initial questions.
//   4. If neither is present → return a FALLBACK immediately.
//   5. On any error in either mode → return the appropriate FALLBACK.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    // Parses the request body.
    // 'systemPrompt' is a string (or undefined): the teacher's masterprompt.
    // 'step1Answer' is a string (or undefined): the student's answer to step 1,
    //   only present in MODE 2 calls. Its presence is the branch condition below.
    const { systemPrompt, step1Answer } = await req.json()

    // ── MODE 2: Dynamic step-2 question generation ────────────────────────────
    // 'step1Answer' is truthy — the student has already answered step 1.
    // Goal: return one tailored follow-up question based on their specific answer.
    if (step1Answer) {
      if (!systemPrompt) {
        // No masterprompt context available — return the generic step-2 fallback.
        return new Response(JSON.stringify(STEP2_FALLBACK), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Calls Claude with the step-2 system prompt (appended with the masterprompt),
      // using the student's step-1 answer as the user message for Claude to respond to.
      const step2Response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300, // Number: short response limit — one question + 3–4 options is ~100–150 tokens.
        system: STEP2_SYSTEM_PROMPT + '\n\nMasterprompt:\n' + systemPrompt,
        messages: [{ role: 'user', content: step1Answer }],
      })

      // 'step2Text' is a string or null — the raw JSON text returned by Claude.
      // The ternary guard ensures we only read text if the response content is text type.
      const step2Text =
        step2Response.content[0].type === 'text' ? step2Response.content[0].text.trim() : null

      if (!step2Text) throw new Error('No text content in step 2 response')

      // 'step2Parsed' is an object with a 'question' string and 'options' array.
      // 'JSON.parse' converts the JSON string from Claude into a JavaScript object.
      const step2Parsed = JSON.parse(step2Text)

      return new Response(JSON.stringify(step2Parsed), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── MODE 1: Initial two-question generation ───────────────────────────────
    // 'step1Answer' is falsy — this is the initial call at the start of a new chat.
    // Goal: return two onboarding questions tailored to the bot's role and subject.
    if (!systemPrompt) {
      // No masterprompt available — return the generic two-step fallback.
      return new Response(JSON.stringify(FALLBACK), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Calls Claude with the full masterprompt as the user message, asking it to
    // generate 2 subject-specific onboarding questions in JSON format.
    const aiResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400, // Number: two questions with 3–4 short options each — roughly 200–300 tokens.
      system: ONBOARDING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: systemPrompt }],
    })

    // 'text' is a string or null — the raw JSON text returned by Claude.
    const text =
      aiResponse.content[0].type === 'text' ? aiResponse.content[0].text.trim() : null

    if (!text) throw new Error('No text content in onboarding response')

    // 'parsed' is an object with a 'steps' array — the two-question structure
    // expected by ChatInterface. JSON.parse converts Claude's text output to an object.
    const parsed = JSON.parse(text)

    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    // Catches all errors: API failures, JSON parse errors, network issues.
    // Always returns the FALLBACK so onboarding never shows a broken state to the student.
    console.error('Onboarding API error:', error)
    return new Response(JSON.stringify(FALLBACK), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
