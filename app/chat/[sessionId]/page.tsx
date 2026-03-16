import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import ChatInterface from '@/components/ChatInterface'
import Sidebar from '@/components/Sidebar'

interface PageProps {
  params: { sessionId: string }
}

export default async function ChatPage({ params }: PageProps) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch the chat session
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('id', params.sessionId)
    .eq('user_id', user.id)
    .single()

  if (!session) {
    redirect('/builder')
  }

  // Fetch existing messages
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', params.sessionId)
    .order('created_at', { ascending: true })

  return (
    <div className="h-screen flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <ChatInterface
          sessionId={params.sessionId}
          masterprompt={session.masterprompt}
          initialMessages={
            (messages || []).map((m) => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              created_at: m.created_at,
            }))
          }
          sessionTitle={session.title}
        />
      </div>
    </div>
  )
}
