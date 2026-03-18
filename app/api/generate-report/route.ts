import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SYSTEM_PROMPT = `Du er en assistent der hjælper lærere med at forstå, hvordan elever har brugt et AI-værktøj kaldet ThinkBot. Du modtager en samtale mellem en elev og ThinkBot, samt den masterprompt der styrede AI'ens adfærd.

Generer en rapport i dansk formateret som en to-kolonne tekst-tabel. Brug dette præcise format for hver række (adskil kolonner med en tabulator):

KATEGORI	INDHOLD

Tabellen skal indeholde følgende rækker i denne rækkefølge:

Dato	[dato for samtalen]
Starttidspunkt	[tidspunkt for elevens første besked]
Sluttidspunkt	[tidspunkt for elevens sidste besked]
Elevbeskeder	[antal]
ThinkBot-svar	[antal]
Opfølgende spørgsmål	[Ja/Nej — kort forklaring]
Oversigt	[3-5 sætninger om hvad eleven arbejdede med og hvilken hjælp de bad om]
Kritisk tænkning	[kort vurdering: satte eleven spørgsmålstegn ved svar, omformulerede eller gravede dybere? Eller kopierede de primært det første svar?]
Eksempel-prompts	[3-5 af elevens mest repræsentative beskeder, adskilt med | tegnet]

Vigtigt:
- Brug ingen markdown-formatering som **, *, # eller lignende
- Brug ingen emojis
- Hold indholdet i hver celle kortfattet og konkret
- Eksempel-prompts skal være ordret citerede fra samtalen`

function formatTime(iso: string | undefined, locale: string): string {
  if (!iso) return '–'
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string | undefined, locale: string): string {
  if (!iso) return '–'
  return new Date(iso).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export async function POST(req: Request) {
  try {
    const { messages, masterprompt } = await req.json()

    if (!messages || !masterprompt) {
      return new Response('Missing messages or masterprompt', { status: 400 })
    }

    const userMessages = messages.filter((m: { role: string }) => m.role === 'user')
    const firstUserMsg = userMessages[0]
    const lastUserMsg = userMessages[userMessages.length - 1]

    const date = formatDate(firstUserMsg?.created_at, 'da-DK')
    const startTime = formatTime(firstUserMsg?.created_at, 'da-DK')
    const endTime = formatTime(lastUserMsg?.created_at, 'da-DK')

    const conversation = messages
      .map((m: { role: string; content: string }) => {
        const label = m.role === 'user' ? '[Elev]' : '[ThinkBot]'
        return `${label}: ${m.content}`
      })
      .join('\n\n')

    const userMessage = `Dato: ${date}
Starttidspunkt for elevens første besked: ${startTime}
Sluttidspunkt for elevens sidste besked: ${endTime}

Masterprompt brugt i denne session:
${masterprompt}

Samtale:
${conversation}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const report = response.content[0].type === 'text' ? response.content[0].text : ''

    return new Response(report, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (error) {
    console.error('Generate report error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
