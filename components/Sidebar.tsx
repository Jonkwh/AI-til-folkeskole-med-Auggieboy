'use client'

import { useEffect, useState, useRef } from 'react'
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadSessions()
  }, [])

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

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

    if (diffDays === 0) return 'I dag'
    if (diffDays === 1) return 'I går'
    if (diffDays < 7) return `${diffDays} dage siden`
    return date.toLocaleDateString('da-DK', { month: 'short', day: 'numeric' })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function startRename(session: ChatSession) {
    setEditingId(session.id)
    setEditTitle(session.title)
    setDeletingId(null)
  }

  async function saveRename(sessionId: string) {
    const trimmed = editTitle.trim()
    if (!trimmed) {
      // Revert if empty
      setEditingId(null)
      return
    }

    await supabase
      .from('chat_sessions')
      .update({ title: trimmed })
      .eq('id', sessionId)

    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, title: trimmed } : s))
    )
    setEditingId(null)
  }

  function cancelRename() {
    setEditingId(null)
  }

  function handleRenameKeyDown(e: React.KeyboardEvent, sessionId: string) {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveRename(sessionId)
    } else if (e.key === 'Escape') {
      cancelRename()
    }
  }

  async function confirmDelete(sessionId: string) {
    await supabase.from('messages').delete().eq('session_id', sessionId)
    await supabase.from('chat_sessions').delete().eq('id', sessionId)

    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    setDeletingId(null)

    // If the deleted session is the currently open one, redirect to builder
    if (params?.sessionId === sessionId) {
      router.push('/builder')
    }
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
          + Ny chat
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
          <p className="text-xs text-gray-400 text-center mt-8">Ingen chats endnu</p>
        ) : (
          sessions.map((session) => {
            const isActive = params?.sessionId === session.id
            const isEditing = editingId === session.id
            const isDeleting = deletingId === session.id

            // Delete confirmation view
            if (isDeleting) {
              return (
                <div
                  key={session.id}
                  className="w-full px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm"
                >
                  <p className="text-red-700 text-xs mb-2">Slet denne chat?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => confirmDelete(session.id)}
                      className="px-3 py-1 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                    >
                      Ja
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="px-3 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                    >
                      Nej
                    </button>
                  </div>
                </div>
              )
            }

            // Editing view
            if (isEditing) {
              return (
                <div key={session.id} className="w-full px-3 py-2 rounded-lg bg-gray-200">
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => handleRenameKeyDown(e, session.id)}
                    onBlur={() => saveRename(session.id)}
                    className="w-full text-sm font-medium bg-white rounded px-2 py-1 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
              )
            }

            // Normal view
            return (
              <div key={session.id} className="group relative">
                <button
                  onClick={() => router.push(`/chat/${session.id}`)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-gray-200 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <div className="font-medium truncate pr-12">{session.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {formatDate(session.created_at)}
                  </div>
                </button>

                {/* Rename and delete icons — visible on hover */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      startRename(session)
                    }}
                    className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Omdøb"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeletingId(session.id)
                      setEditingId(null)
                    }}
                    className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                    title="Slet"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleLogout}
          className="w-full py-2 px-4 rounded-lg text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          Log ud
        </button>
      </div>
    </div>
  )
}
