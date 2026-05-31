// ─────────────────────────────────────────────────────────────────────────────
// MODULE: app/chat/[sessionId]/page.tsx
// PURPOSE: The individual chat page, served at the dynamic URL "/chat/[sessionId]".
//          The [sessionId] part of the URL is a placeholder — it changes for each
//          chat session (e.g. "/chat/abc-123"). This server component:
//            1. Checks the user is logged in.
//            2. Loads the specified chat session from the database.
//            3. Loads all existing messages for that session.
//            4. Passes everything to the ChatInterface component for rendering.
//          All of this happens on the server before any HTML reaches the browser,
//          so the page loads with data already present (no loading spinner on first paint).
// ─────────────────────────────────────────────────────────────────────────────

// Imports 'redirect' to handle auth failures and missing sessions gracefully.
import { redirect } from 'next/navigation'

// Imports the server-side Supabase client to verify auth and load data.
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Imports the full chat UI component — this is where all the interaction happens.
import ChatInterface from '@/components/ChatInterface'

// Imports the sidebar navigation component shown on the left of the chat layout.
import Sidebar from '@/components/Sidebar'

// 'PageProps' is a TypeScript interface — an object type definition (not a class or function).
// It describes the shape of the props Next.js passes to this page component.
// It has one property: 'params', which is an object containing one string property: 'sessionId'.
// 'sessionId' is the value extracted from the URL — e.g. for "/chat/abc-123", it is "abc-123".
interface PageProps {
  params: { sessionId: string }
}

// ─────────────────────────────────────────────────────────────────────────────
// 'ChatPage' is an exported async function (a Next.js Server Component).
// It takes one parameter:
//   - 'params' (object, from PageProps): contains the 'sessionId' string extracted from the URL.
// It returns JSX: the full chat layout, or triggers a redirect on auth/access failure.
// ─────────────────────────────────────────────────────────────────────────────
export default async function ChatPage({ params }: PageProps) {

  // 'supabase' is a constant holding the server-side Supabase client object.
  const supabase = createServerSupabaseClient()

  // 'user' is an object (or null) — the logged-in user. Null means no valid session.
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Not logged in — redirect to login before loading any session data.
    redirect('/login')
  }

  // ── Algorithm: Load the chat session ─────────────────────────────────────
  // Queries the 'chat_sessions' table for the specific session, filtering by both
  // the session ID (from the URL) AND the user's ID. The user_id filter is a
  // security measure — it prevents a logged-in user from accessing another user's session.
  // 'session' is an object with the session's data, or null if not found.
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('*') // Selects all columns: id, title, masterprompt, user_id, created_at.
    .eq('id', params.sessionId) // Filter: only the session whose ID matches the URL.
    .eq('user_id', user.id)     // Filter: only sessions that belong to the current user.
    .single()                   // Returns a single object instead of an array (null if not found).

  if (!session) {
    // Session not found or belongs to another user — redirect to the builder.
    redirect('/builder')
  }

  // ── Algorithm: Load existing messages ────────────────────────────────────
  // Loads all previously saved messages for this session, sorted oldest-first.
  // 'messages' is an array of message objects, or null if none exist yet.
  // Passing these as 'initialMessages' means the chat renders with full history
  // immediately, without needing a separate client-side fetch after the page loads.
  const { data: messages } = await supabase
    .from('messages')
    .select('*') // Selects all columns: id, session_id, role, content, created_at.
    .eq('session_id', params.sessionId) // Filter: only messages for this session.
    .order('created_at', { ascending: true }) // Sort: oldest message first (top of chat).

  return (
    // Full-screen flex layout: Sidebar takes a fixed width on the left;
    // the chat interface fills all remaining horizontal space.
    <div className="h-screen flex">
      <Sidebar />
      {/* 'min-w-0' prevents the flex container from expanding beyond the available width
          when a long unbroken message string (e.g. a URL) is present. */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatInterface
          sessionId={params.sessionId}     // String: passed to ChatInterface so it knows which session to save new messages to.
          masterprompt={session.masterprompt} // String: the teacher's system prompt, sent to Claude on every API request.
          initialMessages={
            // Maps each raw Supabase row (a plain object) into the Message type that ChatInterface expects.
            // '|| []' provides an empty array if 'messages' is null (a new session with no history yet).
            (messages || []).map((m) => ({
              id: m.id,                             // String: the Supabase-generated message UUID.
              role: m.role as 'user' | 'assistant', // String cast: ensures the role is the exact union type expected.
              content: m.content,                   // String: the text of the message.
              created_at: m.created_at,             // String: the ISO timestamp when the message was saved.
            }))
          }
          sessionTitle={session.title} // String: the session's current title shown in the chat header.
        />
      </div>
    </div>
  )
}
