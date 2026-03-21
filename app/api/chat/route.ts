import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(req: Request) {
  try {
    const { messages, systemPrompt } = await req.json()

    if (!messages || !systemPrompt) {
      return new Response('Missing messages or systemPrompt', { status: 400 })
    }

    // Server-side guardrail: always appended regardless of student's masterprompt
    const guardrail = '\n\nDu må aldrig skrive en hel opgave, stil, afsnit eller besvarelse på elevens vegne. Hvis en elev beder dig om at skrive noget for dem, skal du i stedet stille et spørgsmål, der hjælper dem i gang selv. For eksempel: \'Hvad tænker du selv, at din indledning skal handle om?\' eller \'Hvilke argumenter har du allerede?\''
    const fullSystemPrompt = systemPrompt + guardrail

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
