// Imports the server-side redirect to protect the page and handle missing sessions gracefully.
import { redirect } from 'next/navigation'
// Imports the server-side Supabase client to verify auth and load session data before rendering.
import { createServerSupabaseClient } from '@/lib/supabase-server'
// Imports the main chat UI component that handles messaging, streaming, and onboarding.
import ChatInterface from '@/components/ChatInterface'
// Imports the sidebar component that lists previous chat sessions and navigation controls.
import Sidebar from '@/components/Sidebar'

// TypeScript type for the URL parameter: the dynamic [sessionId] segment in the route path.
interface PageProps {
  params: { sessionId: string }
}

// The chat page ("/chat/[sessionId]") — loads an existing session and renders the full chat UI.
export default async function ChatPage({ params }: PageProps) {
  // Creates a server-side Supabase client that reads the user's session from cookies.
  const supabase = createServerSupabaseClient()
  // Fetches the logged-in user. If no session exists, user will be null.
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Unauthenticated visitors are redirected to login before any data is fetched.
    redirect('/login')
  }

  // Fetch the chat session — also filters by user_id to prevent users from accessing each other's sessions.
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('id', params.sessionId) // Match the session ID from the URL.
    .eq('user_id', user.id) // Ensures the session belongs to the current user.
    .single() // Returns one row or null (not an array).

  if (!session) {
    // If the session doesn't exist or belongs to another user, redirect to the builder page.
    redirect('/builder')
  }

  // Fetch existing messages for this session, sorted oldest-first so the conversation reads top to bottom.
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', params.sessionId)
    .order('created_at', { ascending: true })

  return (
    // Full-screen layout: sidebar on the left, chat interface filling the remaining space.
    <div className="h-screen flex">
      <Sidebar />
      {/* min-w-0 prevents the flex child from overflowing when message content is very long. */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatInterface
          sessionId={params.sessionId} // Used by ChatInterface to save new messages to the correct session.
          masterprompt={session.masterprompt} // The teacher-configured instructions sent to Claude on every request.
          initialMessages={
            // Maps the raw Supabase rows into the Message shape expected by ChatInterface.
            (messages || []).map((m) => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              created_at: m.created_at,
            }))
          }
          sessionTitle={session.title} // The session title shown in the chat header.
        />
      </div>
    </div>
  )
}
