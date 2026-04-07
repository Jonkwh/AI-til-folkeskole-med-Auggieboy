import { Resend } from 'resend'

const TEACHER_EMAIL = 'jonkristian.nyboder@gmail.com'

export async function POST(req: Request) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { subject, body } = await req.json()

    if (!body) {
      return new Response('Missing body', { status: 400 })
    }

    const { error } = await resend.emails.send({
      from: 'ThinkBot <onboarding@resend.dev>',
      to: TEACHER_EMAIL,
      subject: subject || 'ThinkBot Samtaleeksport',
      text: body,
    })

    if (error) {
      console.error('Resend error:', error)
      return new Response('Failed to send email', { status: 500 })
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    console.error('Send report error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
