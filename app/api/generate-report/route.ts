import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const SYSTEM_PROMPT = `Du er en assistent der hjælper lærere med at forstå, hvordan elever har brugt et AI-værktøj kaldet ThinkBot. Du modtager en samtale mellem en elev og ThinkBot, samt den masterprompt der styrede AI'ens adfærd.

Generer en struktureret rapport i dansk. Rapporten skal være i ren tekst (ikke markdown, ikke JSON) og skal passe ind direkte i et Word-dokument eller Google Doc.

Rapporten skal have følgende sektioner i denne rækkefølge:

📋 OVERSIGT
Skriv 3-5 sætninger der sammenfatter hvad eleven arbejdede med, og hvilken slags hjælp de bad om.

📊 SAMTALESTATISTIK
Angiv:
- Antal elevbeskeder: [tal]
- Antal ThinkBot-svar: [tal]
- Stillede eleven opfølgende spørgsmål der byggede videre på tidligere svar? Ja/Nej — skriv en kort forklaring.

🧠 KRITISK TÆNKNING
Kort vurdering af om eleven viste selvstændig tænkning: satte de spørgsmålstegn ved svar, omformulerede, eller gravede dybere? Eller kopierede de primært det første svar?

⚠️ MULIG SNYD
Marker eventuelle elevbeskeder eller AI-svar der tyder på, at eleven bad AI'en skrive noget direkte for dem (f.eks. "skriv mit afsnit", "lav min konklusion", "giv mig svaret"). Citér den/de præcise besked(er) hvis fundet. Skriv "Ingen mistænkelige mønstre fundet." hvis intet mistænkeligt.

💬 EKSEMPLER PÅ ELEVENS PROMPTS
Vis 3-5 af de mest repræsentative elevbeskeder (ordret citat) så læreren kan fornemme, hvordan eleven brugte værktøjet.

📝 FULD SAMTALE
Den fulde samtale formateret med [Elev]: og [ThinkBot]: labels og en tom linje mellem hver besked.

Vigtigt: Brug ingen markdown-formatering som **, *, # eller lignende. Brug kun de emoji-ikoner angivet ovenfor som sektionsoverskrifter.`

export async function POST(req: Request) {
  try {
    const { messages, masterprompt } = await req.json()

    if (!messages || !masterprompt) {
      return new Response('Missing messages or masterprompt', { status: 400 })
    }

    const date = new Date().toLocaleDateString('da-DK', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    const conversation = messages
      .map((m: { role: string; content: string }) => {
        const label = m.role === 'user' ? '[Elev]' : '[ThinkBot]'
        return `${label}: ${m.content}`
      })
      .join('\n\n')

    const userMessage = `Dato for samtale: ${date}

Masterprompt brugt i denne session:
${masterprompt}

Samtale:
${conversation}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
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
