'use client'

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { createClient } from '@/lib/supabase'
import ShareButton from './ShareButton'
import MasterpromptCard from './MasterpromptCard'

interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
  isError?: boolean
}

interface ChatInterfaceProps {
  sessionId: string
  masterprompt: string
  initialMessages: Message[]
  sessionTitle: string
}

const RATE_LIMIT_WINDOW = 10_000 // 10 seconds
const RATE_LIMIT_MAX = 5

// Jaccard similarity between two messages based on word overlap. Returns 0–1.
// Avoids Set spread to stay compatible with the project's TS/target config.
function wordOverlapSimilarity(a: string, b: string): number {
  const words = (s: string) =>
    s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter((w) => w.length > 2)
  const wordsA = words(a)
  const wordsB = words(b)
  if (wordsA.length === 0 || wordsB.length === 0) return 0
  const setB = new Set(wordsB)
  const intersection = wordsA.filter((w) => setB.has(w)).length
  const combined = wordsA.concat(wordsB)
  const union = combined.filter((w, i) => combined.indexOf(w) === i).length
  return intersection / union
}

const LOOP_SIMILARITY_THRESHOLD = 0.5

const ASSIGNMENT_PATTERNS = [
  /skriv\s+(min|en|et|din)\s+(opgave|stil|afsnit|indledning|konklusion|besvarelse)/i,
  /skriv\s+opgaven/i,
  /lav\s+(min|en|et|din)\s+(opgave|stil|afsnit|indledning|konklusion|besvarelse)/i,
  /lav\s+opgaven/i,
  /kan\s+du\s+(skrive|lave)/i,
  /færdiggør\s+min/i,
  /afslut\s+min/i,
]

export default function ChatInterface({
  sessionId,
  masterprompt,
  initialMessages,
  sessionTitle,
}: ChatInterfaceProps) {
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [title, setTitle] = useState(sessionTitle)
  const [rateLimited, setRateLimited] = useState(false)
  const [assignmentBlocked, setAssignmentBlocked] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messageTimestamps = useRef<number[]>([])
  // Tracks whether the student appears to be looping. Set after each bot response,
  // read on the next send, and cleared automatically when topics diverge.
  const isLooping = useRef(false)
  const isNewChat = initialMessages.length === 0

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px'
    }
  }, [input])

  function checkRateLimit(): boolean {
    const now = Date.now()
    // Remove timestamps outside the window
    messageTimestamps.current = messageTimestamps.current.filter(
      (t) => now - t < RATE_LIMIT_WINDOW
    )
    if (messageTimestamps.current.length >= RATE_LIMIT_MAX) {
      setRateLimited(true)
      // Auto-clear when the oldest message in the window expires
      const oldest = messageTimestamps.current[0]
      const delay = RATE_LIMIT_WINDOW - (now - oldest) + 100
      setTimeout(() => {
        messageTimestamps.current = messageTimestamps.current.filter(
          (t) => Date.now() - t < RATE_LIMIT_WINDOW
        )
        setRateLimited(false)
      }, delay)
      return false
    }
    messageTimestamps.current.push(now)
    return true
  }

  async function updateSessionTitle(firstMessage: string) {
    const newTitle = firstMessage.slice(0, 40) + (firstMessage.length > 40 ? '...' : '')
    setTitle(newTitle)
    await supabase
      .from('chat_sessions')
      .update({ title: newTitle })
      .eq('id', sessionId)
  }

  async function saveMessage(role: 'user' | 'assistant', content: string) {
    await supabase.from('messages').insert({
      session_id: sessionId,
      role,
      content,
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || isStreaming || rateLimited || assignmentBlocked) return

    if (!checkRateLimit()) return

    const userMessage = input.trim()

    // Client-side guardrail: check for assignment writing requests
    if (ASSIGNMENT_PATTERNS.some((p) => p.test(userMessage))) {
      setAssignmentBlocked(true)
      return
    }

    // Update title from first user message
    if (messages.length === 0) {
      updateSessionTitle(userMessage)
    }

    const newUserMsg: Message = { role: 'user', content: userMessage, created_at: new Date().toISOString() }
    setMessages((prev) => [...prev, newUserMsg])
    await saveMessage('user', userMessage)

    setIsStreaming(true)
    // Clear input only after we know we're sending
    setInput('')
    const assistantMsg: Message = { role: 'assistant', content: '', created_at: new Date().toISOString() }
    setMessages((prev) => [...prev, assistantMsg])

    try {
      const allMessages = [...messages, newUserMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages,
          systemPrompt: masterprompt,
          isLooping: isLooping.current,
        }),
      })

      if (!response.ok) {
        const status = response.status
        console.error(`Chat API returned ${status}`)

        let errorMessage: string
        if (status === 429) {
          errorMessage = 'ThinkBot er lidt overbelastet lige nu. Vent et øjeblik og prøv igen 🙂'
        } else {
          errorMessage = 'Noget gik galt. Prøv at sende din besked igen.'
        }

        // Put the user's message back in the input so they can resend
        setInput(userMessage)
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: errorMessage,
            isError: true,
          }
          return updated
        })
        setIsStreaming(false)
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          fullContent += chunk
          setMessages((prev) => {
            const updated = [...prev]
            updated[updated.length - 1] = { role: 'assistant', content: fullContent }
            return updated
          })
        }
      }

      await saveMessage('assistant', fullContent)

      // After each bot response, check if the student's last two messages are
      // semantically similar. If so, flag the next request so Claude shifts strategy.
      const userMsgs = allMessages.filter((m) => m.role === 'user')
      if (userMsgs.length >= 2) {
        const last = userMsgs[userMsgs.length - 1].content
        const secondLast = userMsgs[userMsgs.length - 2].content
        isLooping.current = wordOverlapSimilarity(last, secondLast) > LOOP_SIMILARITY_THRESHOLD
      } else {
        isLooping.current = false
      }
    } catch (err) {
      console.error('Streaming error:', err)
      // Put the user's message back in the input so they can resend
      setInput(userMessage)
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'Det ser ud til, at forbindelsen blev afbrudt. Tjek din internetforbindelse og prøv igen.',
          isError: true,
        }
        return updated
      })
    } finally {
      setIsStreaming(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const sendDisabled = !input.trim() || isStreaming || rateLimited

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-white dark:bg-[#252526]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-900 dark:bg-gray-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">TB</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate max-w-xs">{title}</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500">ThinkBot</p>
          </div>
        </div>
        <ShareButton messages={messages} masterprompt={masterprompt} />
      </div>

      {/* Masterprompt summary card */}
      <MasterpromptCard masterprompt={masterprompt} defaultExpanded={isNewChat} />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-[var(--bg-card)] flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl text-gray-400 dark:text-gray-500">TB</span>
              </div>
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">Start en samtale</h3>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Din masterprompt er klar. Skriv din første besked nedenfor.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.isError
                  ? ''
                  : msg.role === 'user'
                    ? 'bg-gray-900 text-white'
                    : 'bg-[var(--bg-panel)] text-gray-800 dark:text-gray-200'
              }`}
              style={
                msg.isError
                  ? { backgroundColor: '#F5C4B3', color: '#993C1D' }
                  : undefined
              }
            >
              {msg.role === 'assistant' && !msg.isError ? (
                <div className="markdown-content" style={{ overflow: 'hidden' }}>
                  <ReactMarkdown
                    components={{
                      h2: ({ children }) => <h2 style={{ fontWeight: 500, fontSize: '1.05em', marginTop: 12, marginBottom: 4 }}>{children}</h2>,
                      h3: ({ children }) => <h3 style={{ fontWeight: 500, fontSize: '1em', marginTop: 12, marginBottom: 4 }}>{children}</h3>,
                      p: ({ children }) => <p style={{ marginBottom: 8 }}>{children}</p>,
                      strong: ({ children }) => <strong style={{ fontWeight: 500 }}>{children}</strong>,
                      ul: ({ children }) => <ul style={{ paddingLeft: 16, listStyleType: 'disc', marginBottom: 8 }}>{children}</ul>,
                      ol: ({ children }) => <ol style={{ paddingLeft: 16, listStyleType: 'decimal', marginBottom: 8 }}>{children}</ol>,
                      li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              )}
              {msg.role === 'assistant' && isStreaming && idx === messages.length - 1 && !msg.isError && (
                <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5" />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-[var(--border)] bg-white dark:bg-[#252526]">
        <form onSubmit={handleSubmit} className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); setAssignmentBlocked(false) }}
            onKeyDown={handleKeyDown}
            placeholder="Skriv din besked..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-input)] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={sendDisabled}
            className="px-5 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
        {rateLimited && (
          <p className="text-xs mt-2" style={{ color: '#854F0B' }}>
            Vent et øjeblik, før du sender din næste besked 🙂
          </p>
        )}
        {assignmentBlocked && (
          <p className="text-xs mt-2" style={{ color: '#854F0B' }}>
            ThinkBot skriver ikke opgaver, men hjælper dig gerne med at komme i gang 🙂 Prøv at fortælle, hvad du er gået i stå med.
          </p>
        )}
      </div>
    </div>
  )
}
