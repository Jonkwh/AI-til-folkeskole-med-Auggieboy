import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Maps student-facing role labels to proper Claude system prompt openings
const ROLE_PROMPT_MAP: Record<string, string> = {
  'hjælpe med at forstå opgaven':
    'Du er en hjælpsom tutor. Din opgave er at hjælpe eleven med at forstå den opgave, de arbejder med. Stil spørgsmål der hjælper eleven med selv at finde ud af, hvad opgaven beder om.',
  'teste ideer':
    'Du er en kritisk sparringspartner. Din opgave er at hjælpe eleven med at teste og vurdere deres ideer. Stil spørgsmål der udfordrer ideerne, peger på svagheder og hjælper eleven med at styrke dem.',
  'komme med ideer':
    'Du er en idéudvikler. Din opgave er at hjælpe eleven med at brainstorme og udvikle ideer til deres projekt eller opgave.',
  'give feedback på min tekst':
    'Du er en konstruktiv læser. Din opgave er at give eleven specifik og brugbar feedback på den tekst, de deler med dig. Peg på hvad der fungerer godt, og hvad der kan forbedres.',
  'hjælpe med at læse op til eksamen':
    'Du er en eksamenshjælper. Din opgave er at hjælpe eleven med at repetere og forstå fagligt stof til eksamen ved at stille spørgsmål, forklare begreber og tjekke elevens forståelse.',
  'hjælpe med datavisualisering':
    'Du er en dataformidler. Din opgave er at hjælpe eleven med at forstå, beskrive og visualisere data ved hjælp af tabeller, forklaringer og forslag til diagrammer.',
}

function mapSystemPrompt(studentPrompt: string): string {
  // Match new format: "AI'en skal <role>. \nfor elever i ... \nAldrig ..."
  const roleMatch = studentPrompt.match(/AI'en skal (.+?)(?:\.\s|\.$|$)/m)

  if (roleMatch) {
    const roleKey = roleMatch[1].trim()
    const mappedOpening = ROLE_PROMPT_MAP[roleKey]

    if (mappedOpening) {
      // Replace the student-facing role line with the mapped prompt opening
      // Keep context and restriction lines as-is
      const rest = studentPrompt
        .replace(/AI'en skal .+?(?:\.\s|\.\s*$)/m, '')
        .trim()
      return `${mappedOpening}\n${rest}`
    }
  }

  // Legacy format or unrecognized — pass through as-is
  return studentPrompt
}

export async function POST(req: Request) {
  try {
    const { messages, systemPrompt } = await req.json()

    if (!messages || !systemPrompt) {
      return new Response('Missing messages or systemPrompt', { status: 400 })
    }

    // Map student-facing labels to proper Claude instructions
    const mappedPrompt = mapSystemPrompt(systemPrompt)

    // Server-side guardrail: always appended regardless of student's masterprompt
    const guardrail = '\n\nDu må aldrig skrive en hel opgave, stil, afsnit eller besvarelse på elevens vegne. Hvis en elev beder dig om at skrive noget for dem, skal du i stedet stille et spørgsmål, der hjælper dem i gang selv. For eksempel: \'Hvad tænker du selv, at din indledning skal handle om?\' eller \'Hvilke argumenter har du allerede?\''
    const fullSystemPrompt = mappedPrompt + guardrail

    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: fullSystemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    })

    const encoder = new TextEncoder()

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error: unknown) {
    console.error('Chat API error:', error)

    // Forward Anthropic rate limit errors as 429
    if (error instanceof Anthropic.RateLimitError) {
      return new Response('Rate limited', { status: 429 })
    }

    return new Response('Internal server error', { status: 500 })
  }
}
