// Marks this as a client component because it manages interactive state and listens to navigation events.
'use client'

// Imports React hooks: useEffect for side effects, useState for state, useRef for the rename input focus.
import { useEffect, useState, useRef } from 'react'
// Imports navigation hooks: useRouter to redirect, useParams to read the current session ID from the URL.
import { useRouter, useParams } from 'next/navigation'
// Imports the browser-side Supabase client for fetching and modifying chat sessions.
import { createClient } from '@/lib/supabase'
// Imports the modal component that wraps the MasterpromptBuilder for creating new chats.
import MasterpromptModal from './MasterpromptModal'
// Imports the dark mode hook that reads and persists the user's theme preference.
import { useDarkMode } from '@/hooks/useDarkMode'
import { useLanguage } from '@/lib/LanguageContext'

// Minimal shape of a chat session as returned by the Supabase query in loadSessions.
interface ChatSession {
  id: string
  title: string
  created_at: string
}

// The left-side navigation panel that lists the user's previous chat sessions and provides controls for
// creating new sessions, renaming, deleting, switching theme, and logging out.
export default function Sidebar() {
  const router = useRouter() // Used to navigate programmatically (e.g. after delete, logout).
  const params = useParams() // Reads the current [sessionId] URL segment to highlight the active session.
  const supabase = createClient() // Browser-side Supabase client for all database and auth operations.
  const [sessions, setSessions] = useState<ChatSession[]>([]) // The list of chat sessions shown in the sidebar.
  const [loading, setLoading] = useState(true) // True while sessions are being fetched — shows skeleton placeholders.
  const [editingId, setEditingId] = useState<string | null>(null) // The ID of the session currently being renamed, or null.
  const [editTitle, setEditTitle] = useState('') // The current value in the rename input field.
  const [deletingId, setDeletingId] = useState<string | null>(null) // The ID of the session awaiting delete confirmation, or null.
  const [isModalOpen, setIsModalOpen] = useState(false) // Controls whether the "new chat" masterprompt modal is open.
  const editInputRef = useRef<HTMLInputElement>(null) // Reference to the rename input — used to focus it when editing starts.
  const { isDark, toggleDark } = useDarkMode() // Current theme state and toggle function from the dark mode hook.
  const { t, toggleLanguage } = useLanguage()

  // Loads the session list when the sidebar first mounts.
  useEffect(() => {
    loadSessions()
  }, [])

  // Focuses and selects all text in the rename input whenever the user starts renaming a session.
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  // Fetches all chat sessions belonging to the currently logged-in user, sorted newest first.
  async function loadSessions() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return // Silently exits if the user is not logged in — the page-level guard handles the redirect.

    const { data } = await supabase
      .from('chat_sessions')
      .select('id, title, created_at')
      .eq('user_id', user.id) // Ensures each user only sees their own sessions.
      .order('created_at', { ascending: false }) // Newest sessions appear at the top of the list.

    setSessions(data || []) // Falls back to an empty array if the query returns no data.
    setLoading(false)
  }

  // Formats an ISO timestamp as a human-readable relative date string (e.g. "I dag", "I går", "3 dage siden").
  function formatDate(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    // Calculates how many full days have passed since the session was created.
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return t('sidebar.today')
    if (diffDays === 1) return t('sidebar.yesterday')
    if (diffDays < 7) return `${diffDays} ${t('sidebar.daysAgo')}`
    // For sessions older than a week, shows a short date like "18. mar".
    return date.toLocaleDateString('da-DK', { month: 'short', day: 'numeric' })
  }

  // Signs the user out and redirects them to the login page.
  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Enters rename mode for a session: stores its ID and current title so the edit input is pre-filled.
  // Also closes any pending delete confirmation to avoid two active states at once.
  function startRename(session: ChatSession) {
    setEditingId(session.id)
    setEditTitle(session.title)
    setDeletingId(null)
  }

  // Saves the new title to Supabase and updates the local session list optimistically.
  async function saveRename(sessionId: string) {
    const trimmed = editTitle.trim().replace(/—/g, '-') // Normalises em dashes to hyphens for consistency.
    if (!trimmed) {
      // Revert if empty — an empty title would be confusing in the session list.
      setEditingId(null)
      return
    }

    // Persists the new title to the database.
    await supabase
      .from('chat_sessions')
      .update({ title: trimmed })
      .eq('id', sessionId)

    // Updates the local state immediately so the UI reflects the change without a full reload.
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, title: trimmed } : s))
    )
    setEditingId(null) // Exits rename mode.
  }

  // Cancels renaming without saving — discards any edits.
  function cancelRename() {
    setEditingId(null)
  }

  // Handles keyboard shortcuts in the rename input: Enter saves, Escape cancels.
  function handleRenameKeyDown(e: React.KeyboardEvent, sessionId: string) {
    if (e.key === 'Enter') {
      e.preventDefault() // Prevents form submission if the input is inside a form.
      saveRename(sessionId)
    } else if (e.key === 'Escape') {
      cancelRename()
    }
  }

  // Permanently deletes a session and all its messages from the database.
  // Messages must be deleted first because of the foreign-key constraint on session_id.
  async function confirmDelete(sessionId: string) {
    await supabase.from('messages').delete().eq('session_id', sessionId) // Removes all messages for this session.
    await supabase.from('chat_sessions').delete().eq('id', sessionId) // Removes the session itself.

    setSessions((prev) => prev.filter((s) => s.id !== sessionId)) // Removes the deleted session from the local list.
    setDeletingId(null) // Exits the delete confirmation state.

    // If the deleted session is the currently open one, redirect to builder to avoid showing a broken chat.
    if (params?.sessionId === sessionId) {
      router.push('/builder')
    }
  }

  return (
    <>
    <MasterpromptModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    <div className="w-72 h-full bg-[var(--bg-surface)] border-r border-[var(--border)] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
            <span className="text-white text-xs font-bold">TB</span>
          </div>
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">{t('sidebar.brand')}</span>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full py-2.5 px-4 rounded-lg border-2 border-dashed border-[var(--border)] text-sm font-medium text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          {t('sidebar.newChat')}
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
          <p className="text-xs text-gray-400 text-center mt-8">{t('sidebar.noChats')}</p>
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
                  <p className="text-red-700 text-xs mb-2">{t('sidebar.deleteConfirm')}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => confirmDelete(session.id)}
                      className="px-3 py-1 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                    >
                      {t('sidebar.deleteYes')}
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="px-3 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
                    >
                      {t('sidebar.deleteNo')}
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
                      ? 'bg-[var(--bg-card)] text-gray-900 dark:text-gray-100'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-[var(--bg-panel)]'
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
                    title={t('sidebar.rename')}
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
                    title={t('sidebar.delete')}
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
      <div className="p-4 border-t border-[var(--border)] flex items-center gap-2">
        <button
          onClick={toggleDark}
          title={t('sidebar.themeToggle')}
          className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-[var(--bg-panel)] transition-colors"
        >
          {isDark ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10A5 5 0 0012 7z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          )}
        </button>
        <button
          onClick={toggleLanguage}
          className="p-2 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-[var(--bg-panel)] transition-colors"
        >
          {t('lang.toggle')}
        </button>
        <button
          onClick={handleLogout}
          className="flex-1 py-2 px-4 rounded-lg text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-[var(--bg-panel)] transition-colors"
        >
          {t('sidebar.logout')}
        </button>
      </div>
    </div>
    </>
  )
}
