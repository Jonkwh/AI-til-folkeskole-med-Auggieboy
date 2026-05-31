/*
 * Sidebar.tsx
 *
 * This file defines and exports the Sidebar React component — the persistent left-side
 * navigation panel shown on the ThinkBot chat and builder pages.
 *
 * What it does:
 *   - Fetches and displays the current teacher's chat sessions (sorted newest first) as a
 *     scrollable list. Each entry shows the session title and a human-readable relative date.
 *   - Highlights the currently open session (matched against the URL's [sessionId] param).
 *   - Provides per-session actions on hover: rename (inline edit input) and delete (with a
 *     two-step confirmation UI). On delete, also navigates away if the deleted session is open.
 *   - Renders a "+ Ny chat" button that opens the MasterpromptModal to create a new session.
 *   - Provides footer controls: a dark/light mode toggle and a "Log ud" (logout) button.
 *
 * Exports:
 *   - Sidebar (default export): a React component with no required props.
 *
 * How it fits in the app:
 *   - Mounted in the shared layout wrapper used by /chat/[sessionId] and /builder pages.
 *   - Depends on MasterpromptModal (opens it for new session creation) and useDarkMode hook.
 *   - Reads and writes the `chat_sessions` and `messages` Supabase tables.
 */

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

/*
 * ChatSession is a TypeScript interface that defines the shape of a single chat session
 * object as returned by the Supabase query in loadSessions. It contains only the three
 * fields the Sidebar needs; the full table has additional columns (e.g. masterprompt).
 *
 * Fields:
 *   id         — the UUID primary key of the session row.
 *   title      — the display title shown in the sidebar list item.
 *   created_at — the ISO 8601 timestamp string used for relative date formatting.
 */
// Minimal shape of a chat session as returned by the Supabase query in loadSessions.
interface ChatSession {
  id: string
  title: string
  created_at: string
}

/*
 * Sidebar is a function (React component) that takes no parameters and returns JSX.
 *
 * It renders the entire left-side navigation panel, including:
 *   - The ThinkBot logo and "+ Ny chat" button at the top.
 *   - The scrollable session list in the middle.
 *   - The theme toggle and logout button in the footer.
 */
// The left-side navigation panel that lists the user's previous chat sessions and provides controls for
// creating new sessions, renaming, deleting, switching theme, and logging out.
export default function Sidebar() {
  // router is the Next.js router object used to navigate programmatically (e.g. after delete, logout).
  const router = useRouter()
  // params is an object containing the current URL params — used to read [sessionId] and highlight the active session.
  const params = useParams()
  // supabase is the browser-side Supabase client instance used for all database and auth operations.
  const supabase = createClient()

  // sessions is an array of ChatSession objects — the list of chat sessions shown in the sidebar.
  const [sessions, setSessions] = useState<ChatSession[]>([])
  // loading is a boolean state variable — true while sessions are being fetched, showing skeleton placeholders.
  const [loading, setLoading] = useState(true)
  // editingId is a string or null state variable — the ID of the session currently being renamed, or null if none.
  const [editingId, setEditingId] = useState<string | null>(null)
  // editTitle is a string state variable — the current value in the rename input field.
  const [editTitle, setEditTitle] = useState('')
  // deletingId is a string or null state variable — the ID of the session awaiting delete confirmation, or null.
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // isModalOpen is a boolean state variable — controls whether the "new chat" masterprompt modal is visible.
  const [isModalOpen, setIsModalOpen] = useState(false)
  // editInputRef is a React ref object pointing to the rename <input> element, used to focus and select text when editing starts.
  const editInputRef = useRef<HTMLInputElement>(null)
  // isDark is a boolean value from the dark mode hook representing the current theme state (true = dark mode active).
  // toggleDark is a function from the dark mode hook that switches between light and dark mode.
  const { isDark, toggleDark } = useDarkMode()

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

  /*
   * loadSessions is an async function that takes no parameters and returns Promise<void>.
   *
   * Algorithm steps:
   *   1. Set loading to true to show skeleton placeholders.
   *   2. Fetch the currently authenticated user from Supabase auth; silently exit if not logged in.
   *   3. Query the `chat_sessions` table for all rows belonging to this user, selecting only
   *      the three fields in ChatSession, ordered by created_at descending (newest first).
   *   4. Store the result in `sessions` state; fall back to an empty array if no data is returned.
   *   5. Set loading to false to hide the skeletons.
   */
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

  /*
   * formatDate is a function that takes one parameter (dateStr: string) and returns a string.
   *
   * It converts an ISO 8601 timestamp string into a human-readable Danish relative date:
   *   - Same day     → "I dag"
   *   - 1 day ago    → "I går"
   *   - 2-6 days ago → "{n} dage siden"
   *   - 7+ days ago  → a short Danish locale date, e.g. "18. mar"
   *
   * Parameters:
   *   dateStr — an ISO 8601 date-time string, as stored in the Supabase `created_at` column.
   *
   * Returns:
   *   A Danish string representing how long ago the session was created.
   */
  // Formats an ISO timestamp as a human-readable relative date string (e.g. "I dag", "I går", "3 dage siden").
  function formatDate(dateStr: string) {
    const date = new Date(dateStr)
    const now = new Date()
    // Calculates how many full days have passed since the session was created.
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'I dag'
    if (diffDays === 1) return 'I går'
    if (diffDays < 7) return `${diffDays} dage siden`
    // For sessions older than a week, shows a short date like "18. mar".
    return date.toLocaleDateString('da-DK', { month: 'short', day: 'numeric' })
  }

  /*
   * handleLogout is an async function that takes no parameters and returns Promise<void>.
   *
   * It calls the Supabase auth signOut method to invalidate the current session token,
   * then navigates the browser to /login.
   */
  // Signs the user out and redirects them to the login page.
  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  /*
   * startRename is a function that takes one parameter (session: ChatSession) and returns void.
   *
   * It enters rename mode for the given session by:
   *   1. Storing the session's ID in editingId so the list renders an input for that row.
   *   2. Pre-filling editTitle with the session's current title.
   *   3. Clearing any pending delete confirmation (deletingId) to avoid two active states at once.
   *
   * Parameters:
   *   session — the ChatSession object whose title is to be renamed.
   */
  // Enters rename mode for a session: stores its ID and current title so the edit input is pre-filled.
  // Also closes any pending delete confirmation to avoid two active states at once.
  function startRename(session: ChatSession) {
    setEditingId(session.id)
    setEditTitle(session.title)
    setDeletingId(null)
  }

  /*
   * saveRename is an async function that takes one parameter (sessionId: string) and returns Promise<void>.
   *
   * Algorithm steps:
   *   1. Trim whitespace from editTitle and normalise em dashes to hyphens.
   *   2. If the result is empty, exit rename mode without saving (empty titles are not allowed).
   *   3. Update the `title` column in the `chat_sessions` row with the matching ID.
   *   4. Update the local `sessions` array optimistically so the UI reflects the change immediately.
   *   5. Clear editingId to exit rename mode.
   *
   * Parameters:
   *   sessionId — the string UUID of the session whose title is being saved.
   */
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

  /*
   * cancelRename is a function that takes no parameters and returns void.
   *
   * It exits rename mode by setting editingId to null, discarding any edits the user made
   * to editTitle without persisting them to the database.
   */
  // Cancels renaming without saving — discards any edits.
  function cancelRename() {
    setEditingId(null)
  }

  /*
   * handleRenameKeyDown is a function that takes two parameters
   * (e: React.KeyboardEvent, sessionId: string) and returns void.
   *
   * It handles keyboard shortcuts in the rename <input>:
   *   - Enter: prevents default form submission and calls saveRename.
   *   - Escape: calls cancelRename to discard the edit.
   *
   * Parameters:
   *   e         — the React keyboard event fired by the input element.
   *   sessionId — the string UUID of the session being renamed, forwarded to saveRename.
   */
  // Handles keyboard shortcuts in the rename input: Enter saves, Escape cancels.
  function handleRenameKeyDown(e: React.KeyboardEvent, sessionId: string) {
    if (e.key === 'Enter') {
      e.preventDefault() // Prevents form submission if the input is inside a form.
      saveRename(sessionId)
    } else if (e.key === 'Escape') {
      cancelRename()
    }
  }

  /*
   * confirmDelete is an async function that takes one parameter (sessionId: string) and returns Promise<void>.
   *
   * Algorithm steps:
   *   1. Delete all rows in the `messages` table where session_id equals sessionId.
   *      (Must happen first because of the foreign-key constraint referencing chat_sessions.id.)
   *   2. Delete the session row itself from `chat_sessions`.
   *   3. Remove the deleted session from the local `sessions` array.
   *   4. Clear deletingId to exit the delete confirmation UI.
   *   5. If the deleted session is the one currently open (matched via URL params), redirect to /builder.
   *
   * Parameters:
   *   sessionId — the string UUID of the session to permanently delete.
   */
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
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">ThinkBot</span>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full py-2.5 px-4 rounded-lg border-2 border-dashed border-[var(--border)] text-sm font-medium text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
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
            // isActive is a boolean constant — true when this session's ID matches the current URL segment.
            const isActive = params?.sessionId === session.id
            // isEditing is a boolean constant — true when this session is being renamed.
            const isEditing = editingId === session.id
            // isDeleting is a boolean constant — true when this session is awaiting delete confirmation.
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
      <div className="p-4 border-t border-[var(--border)] flex items-center gap-2">
        <button
          onClick={toggleDark}
          title="Skift farvetema"
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
          onClick={handleLogout}
          className="flex-1 py-2 px-4 rounded-lg text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-[var(--bg-panel)] transition-colors"
        >
          Log ud
        </button>
      </div>
    </div>
    </>
  )
}
