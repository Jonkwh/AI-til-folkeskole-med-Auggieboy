// ─────────────────────────────────────────────────────────────────────────────
// MODULE: app/api/send-report/route.ts
// PURPOSE: A Next.js API route that receives a plain-text report and emails it
//          to the teacher using the Resend email service. This is called when
//          a student clicks "Send til lærer" in the ShareButton modal — the client
//          POSTs the generated report text here, and this module forwards it as
//          an email via Resend's API.
// ENDPOINT: POST /api/send-report
// INPUTS:   JSON body with two string fields: 'subject' and 'body'
// OUTPUTS:  HTTP 200 "OK" on success, or HTTP 400/500 on failure
// ─────────────────────────────────────────────────────────────────────────────

// Imports the 'Resend' class from the 'resend' npm package.
// Resend is a third-party email delivery service. The class is used to create
// a client object that can call the Resend API to send emails.
import { Resend } from 'resend'

// 'TEACHER_EMAIL' is a string constant — the hardcoded email address of the teacher
// who receives every shared report. It is defined at module level so it is easy
// to find and update when the teacher changes.
const TEACHER_EMAIL = 'jonkristian.nyboder@gmail.com'

// ─────────────────────────────────────────────────────────────────────────────
// 'POST' is an exported async function — the HTTP POST request handler for this route.
// Next.js automatically calls this function when a POST request arrives at /api/send-report.
// It takes one parameter:
//   - 'req' (type: Request): the incoming HTTP request object, which contains
//     the request body (the email subject and report text as JSON).
// It returns a Response object with a status code and a short text body.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    // 'resend' is a constant holding a Resend client object.
    // It is created here (inside the function) rather than at module level so that
    // the API key is read fresh on each request, which is safer and allows key rotation.
    // 'process.env.RESEND_API_KEY' is a string environment variable — the secret key
    // from Resend's dashboard. It must be set in Vercel or .env.local and never committed to Git.
    const resend = new Resend(process.env.RESEND_API_KEY)

    // Parses the HTTP request body from JSON format into a JavaScript object.
    // 'subject' is a string — the email subject line (e.g. "ThinkBot Samtaleeksport").
    // 'body' is a string — the full plain-text report content to put in the email body.
    const { subject, body } = await req.json()

    if (!body) {
      // Guard: if 'body' is missing (empty string, null, or undefined), there is
      // nothing to email. Return a 400 Bad Request response immediately.
      return new Response('Missing body', { status: 400 })
    }

    // Calls the Resend API to send the email.
    // 'resend.emails.send' is an async function that accepts a configuration object and
    // returns an object with an 'error' property (null on success, an error object on failure).
    const { error } = await resend.emails.send({
      from: 'ThinkBot <onboarding@resend.dev>', // String: the sender display name and address shown in the teacher's inbox.
      to: TEACHER_EMAIL, // String: the recipient address — the hardcoded teacher email above.
      subject: subject || 'ThinkBot Samtaleeksport', // String: uses the provided subject, or falls back to a default if subject was not sent.
      text: body, // String: the plain-text email body — the full generated report.
    })

    if (error) {
      // 'error' is an object returned by Resend when the email could not be delivered.
      // Log it for debugging in the server console and return a 500 Internal Server Error.
      console.error('Resend error:', error)
      return new Response('Failed to send email', { status: 500 })
    }

    // The email was accepted by Resend. Return a simple 200 OK so the client
    // knows to show the success confirmation message.
    return new Response('OK', { status: 200 })

  } catch (error) {
    // Catches unexpected runtime errors — e.g. malformed JSON in the request body,
    // or a network failure when contacting the Resend API.
    console.error('Send report error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}
