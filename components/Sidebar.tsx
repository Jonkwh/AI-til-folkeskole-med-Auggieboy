'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface ChatSession {
  id: string
  title: string
  created_at: string
}

export default function Sidebar() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSessions()
  }, [])

  async function loadSessions() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('chat_sessions')
      .select('id, title, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setSessions(data || [])
    setLoading(false)
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="w-72 h-full bg-gray-50 border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
            <span className="text-white text-xs font-bold">TB</span>
          </div>
          <span className="text-lg font-semibold text-gray-900">ThinkBot</span>
        </div>
        <button
          onClick={() => router.push('/builder')}
          className="w-full py-2.5 px-4 rounded-lg border-2 border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors"
        >
          + New chat
        </button>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {loading ? (
          // Loading skeleton
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-12 bg-gray-200 rounded-lg" />
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-xs text-gray-400 text-center mt-8">No chats yet</p>
        ) : (
          sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => router.push(`/chat/${session.id}`)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                params?.sessionId === session.id
                  ? 'bg-gray-200 text-gray-900'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div className="font-medium truncate">{session.title}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {formatDate(session.created_at)}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleLogout}
          className="w-full py-2 px-4 rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
