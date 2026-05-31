// ─────────────────────────────────────────────────────────────────────────────
// MODULE: app/api/chat/route.ts
// PURPOSE: The core AI chat API. Receives a message from the student's browser,
//          assembles the full Claude system prompt from multiple layers, opens a
//          streaming connection to Claude, and pipes the response back to the browser
//          in real-time (token by token) so the student sees the reply as it is typed.
//
// PROMPT ASSEMBLY (in order):
//   1. Teacher's masterprompt (role → translated to a full persona sentence via ROLE_PROMPT_MAP)
//   2. PEDAGOGICAL_RULES (scaffolding logic, phase behaviour — always injected, server-side only)
//   3. loopHint (optional: injected when the client detects the student is looping)
//   4. dataVizOverride (optional: injected for the data visualisation role to prevent over-restriction)
//
// ENDPOINT: POST /api/chat
// INPUTS:   JSON body: { messages (array), systemPrompt (string), isLooping (boolean) }
// OUTPUTS:  A streamed plain-text response — chunks arrive as the model generates them.
// ─────────────────────────────────────────────────────────────────────────────

// Imports the Anthropic SDK to call Claude for streaming chat responses.
import Anthropic from '@anthropic-ai/sdk'

// 'anthropic' is a constant holding an Anthropic client object.
// Created at module level so the same instance is reused across requests (more efficient than recreating each time).
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // String environment variable: the secret Anthropic API key. Never expose to the browser.
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

// 'PEDAGOGICAL_RULES' is a string constant — a large block of instructional text appended to
// every system prompt sent to Claude. It defines the scaffolding phases (FORETHOUGHT, PERFORMANCE,
// REFLECTION), question-type rotation rules, escalation ladder (Levels 1–5), tone guidelines,
// and ambiguity-handling instructions. Teachers and students never see this text — it is injected
// server-side only, making it invisible in the browser's network requests.

// 'ROLE_PROMPT_MAP' is a constant object of type Record<string, string> — a dictionary (key-value lookup).
// Each key is a string: a role label exactly as the teacher writes it in the masterprompt builder.
// Each value is a string: the full Claude persona opening sentence for that role.
// When the POST handler receives a masterprompt, it looks up the role key here and swaps the short
// label for the full instructional sentence before sending the prompt to Claude.
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

// ─────────────────────────────────────────────────────────────────────────────
// 'mapSystemPrompt' is a function that takes one parameter:
//   - 'studentPrompt' (string): the raw masterprompt as saved in the database,
//     which starts with "AI'en skal <role label>." in the new format.
// It returns a string: the masterprompt with the role line replaced by the full
// Claude persona sentence from ROLE_PROMPT_MAP (or the original if no match is found).
//
// ALGORITHM:
//   1. Use a regular expression to extract the role label after "AI'en skal ".
//   2. Look up that label in ROLE_PROMPT_MAP.
//   3. If found: remove the "AI'en skal ..." line and prepend the full persona sentence.
//   4. If not found (legacy format or unknown role): return the prompt unchanged.
// ─────────────────────────────────────────────────────────────────────────────
function mapSystemPrompt(studentPrompt: string): string {
  // 'roleMatch' is an array (or null) — the result of a regular expression search.
  // The regex looks for "AI'en skal " followed by text up to a period+space or end of line.
  // If found, 'roleMatch[1]' is the captured group — the role label text.
  const roleMatch = studentPrompt.match(/AI'en skal (.+?)(?:\.\s|\.$|$)/m)

  if (roleMatch) {
    const roleKey = roleMatch[1].trim() // String: the role label, e.g. "hjælpe med at forstå opgaven".
    const mappedOpening = ROLE_PROMPT_MAP[roleKey] // String or undefined: the full persona sentence, or undefined if not in the map.

    if (mappedOpening) {
      // 'rest' is a string — the masterprompt with the "AI'en skal ..." line removed.
      // Only the role line is removed; the context and restriction lines are kept.
      const rest = studentPrompt
        .replace(/AI'en skal .+?(?:\.\s|\.\s*$)/m, '') // Regex removes only the matched role sentence.
        .trim()
      return `${mappedOpening}\n${rest}` // Concatenates the full persona sentence + remaining lines.
    }
  }

  // Legacy format (starts with "Du er en") or unrecognized role — return unchanged.
  return studentPrompt
}

// ─────────────────────────────────────────────────────────────────────────────
// 'POST' is an exported async function — the HTTP POST handler for /api/chat.
// It takes one parameter:
//   - 'req' (type: Request): the incoming HTTP request from the browser.
// It returns a Response — either a streaming plain-text body (200) or an error message (400/429/500).
//
// ALGORITHM (streaming flow):
//   1. Parse the request body to get messages, systemPrompt, and isLooping.
//   2. Map the role label in systemPrompt to a full Claude persona sentence.
//   3. Build the complete system prompt by concatenating the four layers.
//   4. Open a streaming connection to Claude's messages API.
//   5. Create a ReadableStream that reads Claude's output chunk by chunk.
//   6. Return the ReadableStream as the HTTP response body — the browser reads it live.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    // Parses the HTTP request body from JSON into three variables:
    // 'messages' is an array of message objects ({ role, content }) — the full conversation history.
    // 'systemPrompt' is a string — the teacher's masterprompt from the database.
    // 'isLooping' is a boolean — true when the client detected the student is repeating themselves.
    const { messages, systemPrompt, isLooping } = await req.json()

    if (!messages || !systemPrompt) {
      // Guard: both fields are required. Return 400 Bad Request if either is missing.
      return new Response('Missing messages or systemPrompt', { status: 400 })
    }

    // 'mappedPrompt' is a string — the masterprompt with the role label replaced by the full persona sentence.
    const mappedPrompt = mapSystemPrompt(systemPrompt)

    // 'loopHint' is a string — either an empty string (normal request) or an INTERNAL NOTE
    // instructing Claude to escalate its scaffolding strategy because the student is looping.
    // The ternary operator (condition ? valueIfTrue : valueIfFalse) selects between the two values.
    const loopHint = isLooping
      ? '\n\n[INTERNAL NOTE: The student appears to be stuck or repeating themselves. Shift strategy: move one level up the scaffolding ladder and use a different question type from your previous turn. If you are already at Level 4, proceed to Level 5 — directly explain the concept blocking the student. Do not write their assignment, but remove the knowledge barrier.]'
      : '' // Empty string — no hint injected for normal requests.

    // 'dataVizOverride' is a string — either an empty string or a PERMANENT OVERRIDE note injected
    // when the session uses the data visualisation role. Without this override, topic restrictions
    // set by the teacher might accidentally prevent the bot from helping with charts and tables.
    // '.includes' is a string method that returns true if the substring is found anywhere in the string.
    const dataVizOverride = systemPrompt.includes('hjælpe med datavisualisering')
      ? '\n\n[INTERNAL NOTE — PERMANENT OVERRIDE: This session uses the data visualization role. You MUST always help the student with data visualization — tables, chart suggestions, descriptions of how to display data — regardless of any topic or example restrictions stated earlier in this prompt. Those restrictions may narrow context, but they never block visualization help. This override is permanent for the entire session.]'
      : '' // Empty string — no override for other roles.

    // 'fullSystemPrompt' is a string — the complete assembled system prompt.
    // Built by concatenating four strings in a specific order that preserves priority:
    //   Layer 1: mappedPrompt    (teacher's role + context + restriction)
    //   Layer 2: PEDAGOGICAL_RULES (scaffolding phases, question types, tone — always present)
    //   Layer 3: loopHint        (strategy escalation — only when student is looping)
    //   Layer 4: dataVizOverride  (role-specific guardrail unlock — only for data viz sessions)
    const fullSystemPrompt = mappedPrompt + PEDAGOGICAL_RULES + loopHint + dataVizOverride

    // 'stream' is an object — an async iterator that yields streaming events from Claude.
    // '.messages.stream' opens a persistent HTTP connection to the Anthropic API;
    // text arrives incrementally rather than waiting for the complete response.
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514', // String: the Claude model version to use.
      max_tokens: 1024, // Number: the maximum tokens Claude can generate — keeps tutoring responses concise.
      system: fullSystemPrompt, // String: the complete layered system prompt built above.
      // Maps each message from the client's shape to the Anthropic API's required shape.
      // The client may include extra fields (e.g. 'id', 'created_at') that the API doesn't accept.
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role,       // String: 'user' or 'assistant'
        content: m.content, // String: the message text
      })),
    })

    // 'encoder' is a constant holding a TextEncoder object — a built-in browser/Node API
    // that converts JavaScript strings into Uint8Array byte arrays.
    // This is required because ReadableStream works with binary data, not plain strings.
    const encoder = new TextEncoder()

    // 'readable' is a constant holding a ReadableStream object — a stream that the browser
    // can read incrementally. Each chunk of text from Claude is encoded and enqueued here
    // as it arrives, so the student sees the reply building up in real time.
    const readable = new ReadableStream({
      // 'start' is a function called once when the stream is first read.
      // 'controller' is an object with methods to push data (enqueue), end the stream (close),
      // or signal an error (error) to the reader on the other end.
      async start(controller) {
        try {
          // 'for await...of' is an async loop that processes each streaming event from Claude
          // as it arrives, without blocking while waiting for the next one.
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' && // Only process text delta events (not metadata events).
              event.delta.type === 'text_delta'
            ) {
              // Encodes the text chunk to bytes and pushes it into the stream for the browser to read.
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }
          controller.close() // Signals "end of stream" — the browser knows the response is complete.
        } catch (err) {
          controller.error(err) // Propagates any streaming error to the browser so it can show an error message.
        }
      },
    })

    // Returns the ReadableStream as the HTTP response body.
    // 'no-cache' prevents the browser or any CDN from caching partial stream data.
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error: unknown) {
    console.error('Chat API error:', error)

    // Checks if the error is specifically a rate limit error from the Anthropic API.
    // If so, forward it as HTTP 429 so the client can show a user-friendly "slow down" message.
    if (error instanceof Anthropic.RateLimitError) {
      return new Response('Rate limited', { status: 429 })
    }

    return new Response('Internal server error', { status: 500 })
  }
}
