// Imports the Resend SDK — the email-sending service used to deliver reports to the teacher.
import { Resend } from 'resend'

// The teacher's email address that receives every report. Update this when the teacher changes.
const TEACHER_EMAIL = 'jonkristian.nyboder@gmail.com'

// API route handler for POST /api/send-report.
// Accepts a plain-text report body and emails it to the teacher via the Resend service.
export async function POST(req: Request) {
  try {
    // Creates a Resend client using the API key stored in the environment variable.
    // RESEND_API_KEY must be set in Vercel or .env.local — never expose it to the client.
    const resend = new Resend(process.env.RESEND_API_KEY)
    // Parses the JSON request body to extract the email subject and body text.
    const { subject, body } = await req.json()

    if (!body) {
      // Returns a 400 Bad Request error if the email body is missing — nothing useful to send.
      return new Response('Missing body', { status: 400 })
    }

    // Sends the email via the Resend API. The 'from' address uses Resend's shared sandbox domain.
    const { error } = await resend.emails.send({
      from: 'ThinkBot <onboarding@resend.dev>', // Sender identity shown in the teacher's inbox.
      to: TEACHER_EMAIL, // The fixed teacher recipient defined above.
      subject: subject || 'ThinkBot Samtaleeksport', // Falls back to a default subject if none was provided.
      text: body, // The plain-text report content (no HTML needed).
    })

    if (error) {
      // Logs the Resend API error for debugging and returns a 500 so the client knows the email failed.
      console.error('Resend error:', error)
      return new Response('Failed to send email', { status: 500 })
    }

    // Returns a simple "OK" response to confirm the email was accepted by Resend.
    return new Response('OK', { status: 200 })
  } catch (error) {
    // Catches unexpected errors (e.g. network issues, bad JSON) and returns a generic 500.
    console.error('Send report error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
