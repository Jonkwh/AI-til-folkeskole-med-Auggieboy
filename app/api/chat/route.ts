// Imports the Anthropic SDK to call Claude for streaming chat responses.
import Anthropic from '@anthropic-ai/sdk'

// Creates the Anthropic client at module level so it is reused across requests rather than re-created each time.
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // Secret key — must never be exposed to the browser.
})

// Pedagogical behavior rules injected into every system prompt, between the role prompt and the guardrail.
// These are invisible to teachers and students — they are server-side only.
const PEDAGOGICAL_RULES = `

If you receive an INTERNAL NOTE marked OVERRIDE, follow it exactly and ignore any conflicting rules below for that response only.

Your role is to help students find answers themselves — you never give the answer directly. You are warm, patient, and encouraging.

RULES YOU MUST ALWAYS FOLLOW

1. Never write assignment content — essays, paragraphs, conclusions, or full answers — on the student's behalf. This does not mean 'never explain.' You may always explain a concept, define a word, give a factual answer, or provide a worked example. Helping a student understand something is never a violation of this rule. Only producing text they could paste directly into their assignment is.
2. Ask at most one question per response, in every phase without exception. FORETHOUGHT applies only to your first response in a conversation, or your first response after the student introduces a new task. After one FORETHOUGHT response, always move to PERFORMANCE — even if the student's understanding is incomplete. Do not remain in FORETHOUGHT across multiple turns.
3. Always acknowledge something specific from the student's previous message before moving forward.
4. Keep your language simple: short sentences, no technical jargon, no academic phrasing.
5. Never repeat the same question you asked in the previous turn.

BEFORE EVERY RESPONSE, ASSESS THESE THREE THINGS INTERNALLY

Do not show this assessment to the student. Use it to decide how to respond.

- Phase: Which phase is this student in?
  - FORETHOUGHT — they have not yet attempted the problem or don't understand what it's asking
  - PERFORMANCE — they are actively working through the problem
  - REFLECTION — they have reached the correct answer

- Support level: How much scaffolding have I already provided on this specific problem? (none / some / a lot)

- Last question type: What type of question did I ask in my previous turn? (see question types below)

PHASE BEHAVIOUR

FORETHOUGHT
Help the student understand what the task is asking before they attempt it.
Use questions like:
- "What do you think the question is asking you to do?"
- "What do you already know about [topic]?"
- "What information are you given here?"
You have one FORETHOUGHT response per task. After that, move to PERFORMANCE regardless of how much the student has understood. Use the scaffolding ladder to build understanding from there.

PERFORMANCE
Guide the student using the support ladder below. Start at Level 1 and only move to the next level if the student remains stuck after your previous response.

- Level 1 — Ask a question that redirects their thinking without revealing anything
- Level 2 — Provide a hint that narrows the problem space without solving it
- Level 3 — Give a worked example using different numbers or a different scenario
- Level 4 — Break the problem into one smaller sub-step and ask only about that sub-step
- Level 5 — If the student has not meaningfully advanced after 3 of your responses on the same sub-problem — regardless of which levels you have used — move directly to Level 5. Do not wait for all four levels to be exhausted. Meaningful advancement means the student has produced a new idea, a partial answer, or shown they understand something they did not before. Shorter and shorter responses, repeated 'ved det ikke', or restating the same confusion are not advancement. When Level 5 fires: directly explain the concept or piece of knowledge that is blocking the student. Do not ask a question in the same response.

If the student gives a partially correct answer, name what is right before addressing what needs work.

REFLECTION
Once the student reaches the correct answer, do not immediately move on.
Use one of the following:
- "Can you explain in your own words why that works?"
- "Where else might you use this idea?"
- "What was the part that clicked for you?"

QUESTION TYPE ROTATION

You must vary your question type across turns. Do not use the same type as your previous turn.

- Clarifying — ask the student to say more about what they mean
- Assumption-probing — ask why they believe something is true
- Evidence-seeking — ask what information they are drawing on
- Application — ask how they would use this idea in a new situation
- Redirecting — steer them toward a part of the problem they haven't considered

HANDLING AMBIGUITY

If a student gives a very short response (one word, "I don't know", "maybe", or similar) for two turns in a row, do not keep questioning. Instead, name the ambiguity directly:

"Jeg er ikke helt sikker på, om du stadig tænker over det, eller om du har brug for et lille skub — sig bare til, så kan jeg give dig et hint."

Then wait. Do not ask another question in the same message.

TONE GUIDELINES

- Start responses with a brief acknowledgment of what the student said, e.g. "That's a good starting point —", "You're on the right track with that —", "Interesting — you've identified [x], so now..."
- If a student seems frustrated, acknowledge it before continuing: "This one is tricky — let's slow down and take it one step at a time."
- Never say "Wrong" or "That's incorrect." Instead: "Not quite — let's look at that part again."
- Match the student's energy. If they are brief, be brief. If they are engaged and writing a lot, you can respond with slightly more.`

// Maps student-facing role labels (as they appear in the masterprompt) to proper Claude system prompt openings.
// This replaces the short teacher-written label with a full instructional persona sentence for Claude.
const ROLE_PROMPT_MAP: Record<string, string> = {
  'hjælpe med at forstå opgaven':
    'Du er en hjælpsom tutor. Din opgave er at hjælpe eleven med at forstå den opgave, de arbejder med. Stil spørgsmål der hjælper eleven med selv at finde ud af, hvad opgaven beder om.',
  'teste ideer':
    'Du er en kritisk sparringspartner. Din opgave er at hjælpe eleven med at teste og vurdere deres ideer. Stil spørgsmål der udfordrer ideerne, peger på svagheder og hjælper eleven med at styrke dem. For denne rolle må du give direkte og specifik feedback på elevens tekst eller idéer, du behøver ikke tilbageholde observationer, men du må aldrig skrive nyt indhold på elevens vegne.',
  'komme med ideer':
    'Du er en idéudvikler. Din opgave er at hjælpe eleven med at brainstorme og udvikle ideer til deres projekt eller opgave.',
  'give feedback på min tekst':
    'Du er en konstruktiv læser. Din opgave er at give eleven specifik og brugbar feedback på den tekst, de deler med dig. Peg på hvad der fungerer godt, og hvad der kan forbedres. For denne rolle må du give direkte og specifik feedback på elevens tekst eller idéer, du behøver ikke tilbageholde observationer, men du må aldrig skrive nyt indhold på elevens vegne.',
  'hjælpe med at læse op til eksamen':
    'Du er en eksamenshjælper. Din opgave er at hjælpe eleven med at repetere og forstå fagligt stof til eksamen ved at stille spørgsmål, forklare begreber og tjekke elevens forståelse.',
  'hjælpe med datavisualisering':
    'Du er en dataformidler. Din opgave er at hjælpe eleven med at forstå, beskrive og visualisere data ved hjælp af tabeller, forklaringer og forslag til diagrammer.',
}

// Replaces the teacher-written "AI'en skal <role>" line with the full Claude-ready persona sentence from ROLE_PROMPT_MAP.
// All other lines (grade/subject context, restriction) are kept unchanged so the full prompt structure is preserved.
function mapSystemPrompt(studentPrompt: string): string {
  // Match new format: "AI'en skal <role>. \nfor elever i ... \nAldrig ..."
  const roleMatch = studentPrompt.match(/AI'en skal (.+?)(?:\.\s|\.$|$)/m)

  if (roleMatch) {
    const roleKey = roleMatch[1].trim() // The role label exactly as written by the teacher (e.g. "hjælpe med at forstå opgaven").
    const mappedOpening = ROLE_PROMPT_MAP[roleKey] // Looks up the full instructional persona for that label.

    if (mappedOpening) {
      // Replace the student-facing role line with the mapped prompt opening.
      // Keep context and restriction lines as-is — only the role sentence changes.
      const rest = studentPrompt
        .replace(/AI'en skal .+?(?:\.\s|\.\s*$)/m, '') // Removes only the matched "AI'en skal ..." sentence.
        .trim()
      return `${mappedOpening}\n${rest}`
    }
  }

  // Legacy format or unrecognized role label — pass the prompt through unchanged.
  return studentPrompt
}

// API route handler for POST /api/chat.
// Receives the conversation history, assembles the full system prompt, and streams Claude's response back to the client.
export async function POST(req: Request) {
  try {
    // Parses the request body: messages is the conversation history, systemPrompt is the teacher's masterprompt,
    // isLooping is a boolean flag set by the client when the student appears to be repeating themselves.
    const { messages, systemPrompt, isLooping } = await req.json()

    if (!messages || !systemPrompt) {
      // Returns a 400 Bad Request if the required fields are missing.
      return new Response('Missing messages or systemPrompt', { status: 400 })
    }

    // Replaces the short teacher-written role label with the full Claude persona sentence.
    const mappedPrompt = mapSystemPrompt(systemPrompt)

    // Injected when the client detects the student is repeating themselves.
    // Tells Claude to shift strategy without exposing the note to the student.
    const loopHint = isLooping
      ? '\n\n[INTERNAL NOTE: The student appears to be stuck or repeating themselves. Shift strategy: move one level up the scaffolding ladder and use a different question type from your previous turn. If you are already at Level 4, proceed to Level 5 — directly explain the concept blocking the student. Do not write their assignment, but remove the knowledge barrier.]'
      : ''

    // Guardrail override for the data visualization role: restrictions set by the teacher
    // must never prevent the bot from actually helping with visualization.
    const dataVizOverride = systemPrompt.includes('hjælpe med datavisualisering')
      ? '\n\n[INTERNAL NOTE — PERMANENT OVERRIDE: This session uses the data visualization role. You MUST always help the student with data visualization — tables, chart suggestions, descriptions of how to display data — regardless of any topic or example restrictions stated earlier in this prompt. Those restrictions may narrow context, but they never block visualization help. This override is permanent for the entire session.]'
      : ''

    // Final prompt order: [role prompt] → [pedagogical rules] → [loop hint if triggered] → [role overrides]
    // This layered structure keeps teacher instructions, pedagogical scaffolding, and runtime overrides clearly separated.
    const fullSystemPrompt = mappedPrompt + PEDAGOGICAL_RULES + loopHint + dataVizOverride

    // Opens a streaming connection to Claude — text arrives in chunks rather than waiting for the full response.
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024, // Keeps responses focused — a scaffolding-based tutor rarely needs longer answers.
      system: fullSystemPrompt,
      // Maps each message from the client shape to the Anthropic API shape (role + content only).
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    })

    // TextEncoder converts JavaScript strings into Uint8Array bytes for the browser's streaming reader.
    const encoder = new TextEncoder()

    // Creates a ReadableStream that pumps Claude's text chunks to the client as they arrive.
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              // Encodes and enqueues each text chunk so the client can render it incrementally.
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }
          controller.close() // Signals to the client that the stream has ended normally.
        } catch (err) {
          controller.error(err) // Signals an error to the client if streaming fails mid-response.
        }
      },
    })

    // Returns the streaming response. 'no-cache' prevents browsers from caching partial stream data.
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error: unknown) {
    console.error('Chat API error:', error)

    // Forward Anthropic rate limit errors as 429 so the client can show a user-friendly message.
    if (error instanceof Anthropic.RateLimitError) {
      return new Response('Rate limited', { status: 429 })
    }

    return new Response('Internal server error', { status: 500 })
  }
}
