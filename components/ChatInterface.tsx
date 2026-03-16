'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import ShareButton from './ShareButton'
import MasterpromptCard from './MasterpromptCard'

interface Message {
  id?: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

interface ChatInterfaceProps {
  sessionId: string
  masterprompt: string
  initialMessages: Message[]
  sessionTitle: string
}

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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
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
    if (!input.trim() || isStreaming) return

    const userMessage = input.trim()
    setInput('')

    // Update title from first user message
    if (messages.length === 0) {
      updateSessionTitle(userMessage)
    }

    const newUserMsg: Message = { role: 'user', content: userMessage }
    setMessages((prev) => [...prev, newUserMsg])
    await saveMessage('user', userMessage)

    setIsStreaming(true)
    const assistantMsg: Message = { role: 'assistant', content: '' }
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
        }),
      })

      if (!response.ok) throw new Error('Chat API request failed')

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
    } catch (err) {
      console.error('Streaming error:', err)
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'Beklager, noget gik galt. Prøv venligst igen.',
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center">
            <span className="text-white text-xs font-bold">TB</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 truncate max-w-xs">{title}</h2>
            <p className="text-xs text-gray-400">ThinkBot</p>
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
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl text-gray-400">TB</span>
              </div>
              <h3 className="text-lg font-medium text-gray-700">Start en samtale</h3>
              <p className="text-sm text-gray-400 mt-1">
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
                msg.role === 'user'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.role === 'assistant' && isStreaming && idx === messages.length - 1 && (
                <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5" />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-gray-200 bg-white">
        <form onSubmit={handleSubmit} className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Skriv din besked..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="px-5 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
