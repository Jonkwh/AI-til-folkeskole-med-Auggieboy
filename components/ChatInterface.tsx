// Marks this as a client component because it manages all interactive chat state and streaming.
'use client'

// Imports React primitives: useState for state, useRef for mutable values that don't trigger re-renders,
// useEffect for side effects, Fragment to render multiple sibling elements without a wrapping div.
import { useState, useRef, useEffect, Fragment } from 'react'
// Imports the ReactMarkdown component to render Claude's responses with basic formatting.
import ReactMarkdown from 'react-markdown'
// Imports the browser-side Supabase client for saving messages to the database.
import { createClient } from '@/lib/supabase'
// Imports the "Del med lærer" button that opens the report-sharing modal.
import ShareButton from './ShareButton'
// Imports the collapsible masterprompt summary card shown above the message area.
import MasterpromptCard from './MasterpromptCard'

// The shape of a message in the conversation — used for both local state and Supabase rows.
interface Message {
  id?: string // Supabase-generated UUID, only present for messages already saved to the database.
  role: 'user' | 'assistant'
  content: string
  created_at?: string // ISO timestamp — present for persisted messages, absent for optimistic local messages.
  isError?: boolean // True for bot messages that represent an API failure rather than a real response.
  isHidden?: boolean // True for onboarding summary messages shown as student bubbles but not rendered in the chat feed.
}

// A single step in the onboarding flow — a question with multiple choice options.
interface OnboardingStep {
  question: string
  options: string[]
}

// Tracks a re-engagement card shown when the student appears to be looping.
// afterIndex pins the card to a specific position in the message list so it stays inline even as more messages arrive.
interface ReEngagementEntry {
  afterIndex: number // The index of the student message that triggered the re-engagement card.
  selectedOption: string | null // The option the student chose, or null while the card is still active.
}

// Props passed from the server-rendered chat page to this client component.
interface ChatInterfaceProps {
  sessionId: string // The Supabase session ID — used to save new messages to the correct session.
  masterprompt: string // The teacher's configured system prompt — sent to Claude on every API request.
  initialMessages: Message[] // Messages already stored in the database, pre-loaded server-side to avoid a client fetch.
  sessionTitle: string // The current title shown in the chat header.
}

// A message is considered "rate-limited" if the student sends more than 5 messages within a 10-second window.
const RATE_LIMIT_WINDOW = 10_000 // 10 seconds
const RATE_LIMIT_MAX = 5
// Two student messages with a Jaccard word-overlap score above this threshold are treated as a looping pattern.
const LOOP_SIMILARITY_THRESHOLD = 0.7

// The four options shown on the re-engagement card when the student is detected as looping.
const RE_ENGAGEMENT_OPTIONS = [
  'Giv mig et hint',
  'Prøv et nyt spørgsmål',
  'Forklar konceptet',
  'Start forfra',
]

// Maps each re-engagement card option to an internal note appended to the system prompt for that single API call.
// The note overrides Claude's default scaffolding behaviour for the specific response triggered by the card.
const RE_ENGAGEMENT_PROMPTS: Record<string, string> = {
  'Giv mig et hint':
    '\n\n[INTERNAL NOTE — OVERRIDE: The student has explicitly clicked a button requesting a hint. Do NOT ask whether they want a hint. Do NOT ask a clarifying question. Give a concrete, specific hint immediately in this response. A hint means narrowing the problem space with a specific piece of information or a concrete example — not a question. After the hint, you may ask one short follow-up question.]',
  'Prøv et nyt spørgsmål':
    '\n\n[INTERNAL NOTE: The student wants a different angle. Keep the same scaffolding level but rotate to a different question type from your previous turn.]',
  'Forklar konceptet':
    '\n\n[INTERNAL NOTE — OVERRIDE: The student has explicitly asked for a direct explanation. You MUST explain the concept directly in plain language in this response. Do NOT ask a question. Do NOT redirect. Suspend Rule 1 and the scaffolding ladder for this response only. After explaining, you may return to the normal approach.]',
  'Start forfra':
    '\n\n[INTERNAL NOTE: The student wants to start over. Reset to Level 1 of the scaffolding ladder and begin with a forethought question.]',
}

// Generic fallback onboarding questions shown if the /api/onboarding request fails or takes too long.
const ONBOARDING_FALLBACK: OnboardingStep[] = [
  {
    question: 'Hvad arbejder du med i dag?',
    options: ['Jeg er lige startet', 'Jeg er i gang, men sidder fast', 'Jeg har et udkast'],
  },
  {
    question: 'Hvad ville hjælpe dig mest?',
    options: ['Forstå opgaven', 'Komme i gang', 'Tjekke mit arbejde'],
  },
]

// Regular expressions that match common assignment-writing requests in Danish.
// If a student's message matches any of these, it is blocked before reaching the API.
const ASSIGNMENT_PATTERNS = [
  /skriv\s+(min|en|et|din)\s+(opgave|stil|afsnit|indledning|konklusion|besvarelse)/i,
  /skriv\s+opgaven/i,
  /lav\s+(min|en|et|din)\s+(opgave|stil|afsnit|indledning|konklusion|besvarelse)/i,
  /lav\s+opgaven/i,
  /kan\s+du\s+(skrive|lave)/i,
  /færdiggør\s+min/i,
  /afslut\s+min/i,
]

// Patterns that indicate a low-information student response (e.g. "ved ikke", "hva", single word).
const LOW_INFO_PATTERNS = /ved\s+(det\s+)?ikke|forstår\s+(det\s+)?ikke|ingen\s+ide|ikke\s+sikker|^nej$|^hvad$|^hva$/i

// Returns true if a message carries little informational content.
// Used by both the 30-character loop check and the handleSubmit early reset.
function isLowInfo(msg: string): boolean {
  const t = msg.trim()
  return t.length <= 15 || LOW_INFO_PATTERNS.test(t) || !/\s/.test(t)
}

// Jaccard similarity between two messages based on word overlap. Returns 0–1.
// A value above LOOP_SIMILARITY_THRESHOLD indicates the student is repeating themselves.
// Avoids Set spread to stay compatible with the project's TS/target config.
function wordOverlapSimilarity(a: string, b: string): number {
  // Tokenises a string into words longer than 2 characters, lowercased and stripped of punctuation.
  const words = (s: string) =>
    s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter((w) => w.length > 2)
  const wordsA = words(a)
  const wordsB = words(b)
  if (wordsA.length === 0 || wordsB.length === 0) return 0 // Can't compare empty messages.
  const setB = new Set(wordsB)
  const intersection = wordsA.filter((w) => setB.has(w)).length // Words present in both messages.
  const combined = wordsA.concat(wordsB)
  const union = combined.filter((w, i) => combined.indexOf(w) === i).length // All unique words across both.
  return intersection / union // Jaccard index: intersection ÷ union.
}

// The main chat component. Handles the full student interaction: onboarding, message submission,
// streaming responses, loop detection, re-engagement cards, rate limiting, and database persistence.
export default function ChatInterface({
  sessionId,
  masterprompt,
  initialMessages,
  sessionTitle,
}: ChatInterfaceProps) {
  const supabase = createClient() // Browser-side Supabase client used to persist messages.
  const [messages, setMessages] = useState<Message[]>(initialMessages) // The conversation history shown in the chat feed.
  const [input, setInput] = useState('') // The current value in the text input area.
  const [isStreaming, setIsStreaming] = useState(false) // True while a streaming response from Claude is in progress.
  const [title, setTitle] = useState(sessionTitle) // The session title shown in the chat header — updated after the first message.
  const [rateLimited, setRateLimited] = useState(false) // True when the student has sent too many messages too quickly.
  const [assignmentBlocked, setAssignmentBlocked] = useState(false) // True when the student's message matched an assignment-writing pattern.
  const messagesEndRef = useRef<HTMLDivElement>(null) // Invisible div at the bottom of the message list — scrolled into view on new messages.
  const textareaRef = useRef<HTMLTextAreaElement>(null) // Reference to the text input — used to focus it when "Skriv noget selv" is clicked.
  const messageTimestamps = useRef<number[]>([]) // Rolling list of timestamps for messages sent in the current window — used for rate limiting.
  // Tracks whether the student appears to be looping. Set after each bot response,
  // read on the next send, and cleared automatically when topics diverge.
  const isLooping = useRef(false)
  // Blocks isLooping from being set to true for N more student messages after a
  // re-engagement card is selected, preventing back-to-back card appearances.
  const reEngagementCooldownRef = useRef(0)
  const isNewChat = initialMessages.length === 0 // True when this session has no prior messages — enables the onboarding flow.

  // ── Onboarding ─────────────────────────────────────────────────────────────
  // onboardingFetchedRef is set synchronously before the first async tick to
  // prevent double-fetching in React Strict Mode's double-invocation of effects.
  const onboardingFetchedRef = useRef(false)
  // Guards the dynamic step 2 fetch triggered by free-text step 1 submission.
  const step2FetchedRef = useRef(false)
  // Holds the assembled [STUDENT CONTEXT: ...] string until it is injected into
  // the first real API call, after which it is no longer read.
  const studentContextRef = useRef('')
  const [onboardingSteps, setOnboardingSteps] = useState<OnboardingStep[] | null>(null)
  // Start in loading state for new chats so the placeholder renders immediately.
  const [onboardingLoading, setOnboardingLoading] = useState(isNewChat)
  const [step1Answer, setStep1Answer] = useState<string | null>(null)
  const [step2Answer, setStep2Answer] = useState<string | null>(null)
  // Initialised to true for returning users (no onboarding needed).
  const [onboardingComplete, setOnboardingComplete] = useState(!isNewChat)
  // Holds the dynamically generated step 2 when the student typed free text at step 1.
  // Null means card selection was used — fall back to pre-generated onboardingSteps[1].
  const [dynamicStep2, setDynamicStep2] = useState<OnboardingStep | null>(null)
  const [step2Loading, setStep2Loading] = useState(false)

  // ── Re-engagement ───────────────────────────────────────────────────────────
  // Each entry is positioned at a specific index in the messages array so the
  // re-engagement UI renders inline between the student's looping message and
  // the subsequent bot response, regardless of how many messages follow.
  const [reEngagements, setReEngagements] = useState<ReEngagementEntry[]>([])
  const activeReEngagement = reEngagements.find((re) => re.selectedOption === null) ?? null

  // ── Fetch onboarding questions once per new chat ────────────────────────────
  useEffect(() => {
    if (!isNewChat || onboardingFetchedRef.current) return
    onboardingFetchedRef.current = true // set before first async tick

    fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt: masterprompt }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Onboarding fetch failed')
        return res.json()
      })
      .then((data) => {
        if (Array.isArray(data.steps) && data.steps.length >= 2) {
          setOnboardingSteps(data.steps.slice(0, 2))
        } else {
          setOnboardingSteps(ONBOARDING_FALLBACK)
        }
      })
      .catch(() => setOnboardingSteps(ONBOARDING_FALLBACK))
      .finally(() => setOnboardingLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, onboardingSteps, step1Answer, step2Answer, reEngagements])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px'
    }
  }, [input])

  // Checks whether the student has exceeded the rate limit. Returns true if the message is allowed.
  // Enforced client-side to give instant feedback without a round trip to the server.
  function checkRateLimit(): boolean {
    const now = Date.now()
    // Remove timestamps outside the window — keeps only messages sent in the last 10 seconds.
    messageTimestamps.current = messageTimestamps.current.filter(
      (t) => now - t < RATE_LIMIT_WINDOW
    )
    if (messageTimestamps.current.length >= RATE_LIMIT_MAX) {
      setRateLimited(true) // Shows the "Vent et øjeblik" message below the input.
      // Auto-clear when the oldest message in the window expires — no manual reset needed.
      const oldest = messageTimestamps.current[0]
      const delay = RATE_LIMIT_WINDOW - (now - oldest) + 100 // +100ms buffer to avoid a race condition.
      setTimeout(() => {
        messageTimestamps.current = messageTimestamps.current.filter(
          (t) => Date.now() - t < RATE_LIMIT_WINDOW
        )
        setRateLimited(false)
      }, delay)
      return false
    }
    messageTimestamps.current.push(now) // Records this message's timestamp for future rate-limit checks.
    return true
  }

  // Updates the session title in both React state and the database using the first 40 characters of the message.
  // The '…' suffix is added when the message is longer than 40 characters to indicate truncation.
  async function updateSessionTitle(firstMessage: string) {
    const sanitized = firstMessage.replace(/—/g, '-') // Normalises em dashes for consistency.
    const newTitle = sanitized.slice(0, 40) + (sanitized.length > 40 ? '...' : '')
    setTitle(newTitle) // Updates the header immediately without waiting for the database write.
    await supabase
      .from('chat_sessions')
      .update({ title: newTitle })
      .eq('id', sessionId)
  }

  // Persists a single message to the Supabase messages table.
  // Called after every student message and after every completed bot response.
  async function saveMessage(role: 'user' | 'assistant', content: string) {
    await supabase.from('messages').insert({
      session_id: sessionId, // Links the message to the correct session.
      role,
      content,
    })
  }

  // ── Core API call ───────────────────────────────────────────────────────────
  // Extracted so both handleSubmit and handleReEngagementSelect can call it.
  // systemPromptOverride: used by re-engagement to append a one-shot INTERNAL NOTE.
  //   When set, isLooping is sent as false (the note already handles the strategy).
  // restoreInputOnError: when provided, restores the textarea on API failure so
  //   the student can resend without retyping.
  async function callChatAPI(
    conversationMessages: { role: string; content: string }[],
    systemPromptOverride?: string,
    restoreInputOnError?: string,
  ) {
    setIsStreaming(true)
    const assistantMsg: Message = { role: 'assistant', content: '', created_at: new Date().toISOString() }
    setMessages((prev) => [...prev, assistantMsg])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationMessages,
          systemPrompt: systemPromptOverride ?? masterprompt,
          // When a re-engagement override is present the student has already
          // acknowledged the loop via card selection, so we suppress the server-
          // side loop hint to avoid doubling up on instructions.
          isLooping: systemPromptOverride ? false : isLooping.current,
        }),
      })

      if (!response.ok) {
        const status = response.status
        console.error(`Chat API returned ${status}`)
        const errorMessage =
          status === 429
            ? 'ThinkBot er lidt overbelastet lige nu. Vent et øjeblik og prøv igen 🙂'
            : 'Noget gik galt. Prøv at sende din besked igen.'
        if (restoreInputOnError) setInput(restoreInputOnError)
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: errorMessage, isError: true }
          return updated
        })
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true }).replace(/—/g, '-')
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
      // semantically similar. If so, flag the next request so the re-engagement
      // card flow is triggered instead of sending directly.
      const userMsgs = conversationMessages.filter((m) => m.role === 'user')
      if (userMsgs.length >= 2) {
        const last = userMsgs[userMsgs.length - 1].content
        const secondLast = userMsgs[userMsgs.length - 2].content
        // Short responses (≤15 chars) are almost always direct replies to a
        // question, not loops — skip the similarity check entirely.
        if (last.length <= 15 || secondLast.length <= 15) {
          isLooping.current = false
        } else if (wordOverlapSimilarity(last, secondLast) > LOOP_SIMILARITY_THRESHOLD) {
          if (reEngagementCooldownRef.current > 0) {
            reEngagementCooldownRef.current -= 1
          } else {
            isLooping.current = true
          }
        } else {
          isLooping.current = false
        }
      } else {
        isLooping.current = false
      }
      // Also trigger loop detection if the last 3 student messages are all under
      // 30 characters AND at least 2 of them are low-information. This prevents
      // false positives from short but substantive answers.
      if (userMsgs.length >= 3) {
        const lastThree = userMsgs.slice(-3)
        const allShort = lastThree.every((m) => m.content.length < 30)
        if (allShort) {
          const lowInfoCount = lastThree.filter((m) => isLowInfo(m.content)).length
          if (lowInfoCount >= 2) {
            if (reEngagementCooldownRef.current > 0) {
              reEngagementCooldownRef.current -= 1
            } else {
              isLooping.current = true
            }
          }
        }
      }
    } catch (err) {
      console.error('Streaming error:', err)
      if (restoreInputOnError) setInput(restoreInputOnError)
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

  // ── Onboarding handlers ─────────────────────────────────────────────────────

  function handleStep1Select(option: string) {
    setStep1Answer(option)
  }

  async function handleStep2Select(option: string) {
    if (!onboardingSteps || !step1Answer) return
    setStep2Answer(option)
    const activeStep2 = dynamicStep2 ?? onboardingSteps[1]
    // Full context string — sent to the API only, never stored or rendered.
    const context = `[STUDENT CONTEXT: ${onboardingSteps[0].question}: ${step1Answer}. ${activeStep2.question}: ${option}.]`
    // Mark as consumed so handleSubmit never injects it on a subsequent call.
    studentContextRef.current = ''
    setOnboardingComplete(true)

    // Display label shown in the student bubble and saved to Supabase.
    // The raw bracketed context string is API-only.
    const displayLabel = `${step1Answer} - ${option}`
    const newUserMsg: Message = { role: 'user', content: displayLabel, created_at: new Date().toISOString(), isHidden: true }
    setMessages((prev) => [...prev, newUserMsg])
    await saveMessage('user', displayLabel)
    updateSessionTitle(displayLabel)

    // Fire immediately with the context string as the sole user message.
    // messages state is empty at this point — no prior messages to include.
    await callChatAPI([{ role: 'user', content: context }])
  }

  // ── Re-engagement handler ───────────────────────────────────────────────────

  async function handleReEngagementSelect(option: string, afterIndex: number) {
    // Mark the selected card immediately so the UI locks before the API call.
    setReEngagements((prev) =>
      prev.map((re) => (re.afterIndex === afterIndex ? { ...re, selectedOption: option } : re))
    )
    isLooping.current = false
    reEngagementCooldownRef.current = 2

    // Append the per-choice instruction to the system prompt for this single
    // call only. It is not stored and does not affect any subsequent calls.
    const systemPromptWithNote = masterprompt + (RE_ENGAGEMENT_PROMPTS[option] ?? '')

    // messages state at this point includes the pending student message that
    // triggered the re-engagement (added in handleSubmit before returning).
    const allMessages = messages.map((m) => ({ role: m.role, content: m.content }))
    await callChatAPI(allMessages, systemPromptWithNote)
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (
      !input.trim() ||
      isStreaming ||
      rateLimited ||
      assignmentBlocked ||
      !!activeReEngagement
    ) return

    if (!checkRateLimit()) return

    const userMessage = input.trim().replace(/—/g, '-')

    // Client-side guardrail: check for assignment writing requests
    if (ASSIGNMENT_PATTERNS.some((p) => p.test(userMessage))) {
      setAssignmentBlocked(true)
      return
    }

    // Handle freetext submission during onboarding.
    if (!onboardingComplete && onboardingSteps) {
      if (!step1Answer) {
        // Free text during step 1 — set answer and fetch a dynamic step 2
        // question tailored to what the student actually wrote.
        setStep1Answer(userMessage)
        setInput('')
        if (!step2FetchedRef.current) {
          step2FetchedRef.current = true
          setStep2Loading(true)
          fetch('/api/onboarding', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemPrompt: masterprompt, step1Answer: userMessage }),
          })
            .then((res) => {
              if (!res.ok) throw new Error('Step 2 fetch failed')
              return res.json()
            })
            .then((data) => {
              if (data.question && Array.isArray(data.options)) {
                setDynamicStep2({ question: data.question, options: data.options })
              } else {
                setDynamicStep2({
                  question: 'Hvad ville hjælpe dig mest?',
                  options: ['Forstå opgaven bedre', 'Komme i gang med at skrive', 'Få et konkret eksempel'],
                })
              }
            })
            .catch(() => {
              setDynamicStep2({
                question: 'Hvad ville hjælpe dig mest?',
                options: ['Forstå opgaven bedre', 'Komme i gang med at skrive', 'Få et konkret eksempel'],
              })
            })
            .finally(() => setStep2Loading(false))
        }
        return
      } else if (!step2Answer) {
        // Free text during step 2 — complete onboarding exactly as a card
        // selection would: assemble full context, fire API, return early.
        const activeStep2 = dynamicStep2 ?? onboardingSteps[1]
        const context = `[STUDENT CONTEXT: ${onboardingSteps[0].question}: ${step1Answer}. ${activeStep2.question}: ${userMessage}.]`
        setStep2Answer(userMessage)
        setOnboardingComplete(true)
        setInput('')
        const displayLabel = `${step1Answer} — ${userMessage}`
        const newHiddenMsg: Message = { role: 'user', content: displayLabel, created_at: new Date().toISOString(), isHidden: true }
        setMessages((prev) => [...prev, newHiddenMsg])
        await saveMessage('user', displayLabel)
        updateSessionTitle(displayLabel)
        await callChatAPI([{ role: 'user', content: context }])
        return
      }
    }

    // Update title from first user message.
    if (messages.length === 0) {
      updateSessionTitle(userMessage)
    }

    // newUserMsg always stores the clean typed text — the context prefix is
    // never saved to Supabase or rendered in the student bubble.
    const newUserMsg: Message = { role: 'user', content: userMessage, created_at: new Date().toISOString() }
    setMessages((prev) => [...prev, newUserMsg])
    await saveMessage('user', userMessage)
    setInput('')

    // If the student's current message is substantive, clear any stale loop flag
    // before deciding whether to show re-engagement cards.
    if (!isLowInfo(userMessage)) {
      isLooping.current = false
    }

    // If the student appears to be looping, pause the API call and show the
    // re-engagement card flow instead. The afterIndex points to the position
    // of newUserMsg in the updated messages array (messages.length before the
    // state update = the new index after it commits).
    if (isLooping.current) {
      const afterIndex = messages.length
      setReEngagements((prev) => [...prev, { afterIndex, selectedOption: null }])
      return
    }

    // Inject context into the API payload for the first call only.
    // messages.length is the stale closure value — still 0 at this point.
    const apiContent =
      messages.length === 0 && studentContextRef.current
        ? `${studentContextRef.current}\n\n${userMessage}`
        : userMessage
    if (messages.length === 0) studentContextRef.current = ''

    const allMessages = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: apiContent },
    ]
    await callChatAPI(allMessages, undefined, userMessage)
  }

  // Submits the form when the student presses Enter without Shift (Shift+Enter inserts a newline instead).
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault() // Prevents the default newline insertion in the textarea.
      handleSubmit(e)
    }
  }

  // The send button is disabled while streaming, rate-limited, or when a re-engagement card is waiting for a selection.
  const sendDisabled =
    !input.trim() || isStreaming || rateLimited || !!activeReEngagement
  // The text input is disabled during streaming and while a re-engagement card is active.
  const inputDisabled = !!activeReEngagement || isStreaming
  // The placeholder text adapts to the current interaction state to guide the student.
  const inputPlaceholder = !onboardingComplete
    ? step1Answer
      ? 'Eller skriv dit eget svar...' // Step 2 of onboarding — the student can type instead of picking a card.
      : 'Eller beskriv hvad du arbejder med...' // Step 1 of onboarding — invites free text.
    : activeReEngagement
    ? 'Vælg en mulighed ovenfor...' // Re-engagement card is showing — input is disabled.
    : 'Skriv din besked...' // Normal chat mode.

  // ── Shared card class builder ───────────────────────────────────────────────
  // Returns the Tailwind class string for an option card given its selection state.
  function cardClasses(
    isSelected: boolean,
    isFaded: boolean,
    isPending: boolean,
    variant: 'default' | 'amber' = 'default',
  ): string {
    const base = 'border rounded-xl px-4 py-2 text-sm text-left transition-colors'
    const borderAndText =
      variant === 'amber'
        ? 'border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'
        : 'border-[var(--border)] text-gray-800 dark:text-gray-200'

    if (isSelected) return `${base} cursor-default`
    if (isFaded) return `${base} bg-[var(--bg-card)] ${borderAndText} pointer-events-none`
    if (isPending)
      return `${base} bg-[var(--bg-card)] ${borderAndText} hover:bg-[var(--bg-surface)] cursor-pointer`
    return `${base} bg-[var(--bg-card)] ${borderAndText}`
  }

  function cardStyle(
    isSelected: boolean,
    isFaded: boolean,
  ): React.CSSProperties | undefined {
    if (isSelected) return { backgroundColor: '#1a1a2e', color: '#ffffff', borderColor: '#1a1a2e' }
    if (isFaded) return { opacity: 0.35 }
    return undefined
  }

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

        {/* ── Onboarding flow ──────────────────────────────────────────────────
            Replaces the static empty state for new chats. Remains visible in
            the message area after completion — cards lock in their final state. */}
        {isNewChat && (
          <div className="space-y-3">
            {/* Loading placeholder */}
            {onboardingLoading && (
              <div className="flex justify-start animate-fade-in">
                <div className="max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-[var(--bg-panel)] text-gray-500 dark:text-gray-400 italic">
                  Henter spørgsmål...
                </div>
              </div>
            )}

            {/* Steps — rendered once loading is done */}
            {!onboardingLoading && onboardingSteps && (
              <div className="space-y-3 animate-fade-in">
                {/* Step 1: bot question */}
                <div className="flex justify-start">
                  <div className="max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-[var(--bg-panel)] text-gray-800 dark:text-gray-200">
                    {onboardingSteps[0].question}
                  </div>
                </div>

                {/* Step 1: option cards */}
                <div className="flex flex-wrap gap-2">
                  {onboardingSteps[0].options.map((option) => {
                    const isSelected = step1Answer === option
                    const isFaded = !!step1Answer && !isSelected
                    return (
                      <button
                        key={option}
                        onClick={() => !step1Answer && handleStep1Select(option)}
                        className={cardClasses(isSelected, isFaded, !step1Answer)}
                        style={cardStyle(isSelected, isFaded)}
                      >
                        {option}
                      </button>
                    )
                  })}
                </div>
                <div>
                  <button
                    onClick={() => textareaRef.current?.focus()}
                    className="border border-dashed border-[var(--border)] rounded-xl px-4 py-2 text-sm text-left transition-colors bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] cursor-pointer"
                    style={{ color: 'var(--color-text-tertiary)', opacity: 0.7 }}
                  >
                    <em>Skriv noget selv</em>
                  </button>
                </div>

                {/* Helper text — only visible while onboarding is incomplete */}
                {!onboardingComplete && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 pt-1">
                    Vælg en mulighed, eller skriv dit eget svar nedenfor
                  </p>
                )}

                {/* After step 1 selection */}
                {step1Answer && (
                  <div className="space-y-3 animate-fade-in">
                    {/* Student bubble */}
                    <div className="flex justify-end">
                      <div className="max-w-[75%] rounded-2xl px-4 py-3 text-sm bg-gray-900 text-white">
                        {step1Answer}
                      </div>
                    </div>

                    {/* Step 2: loading while dynamic question is being fetched */}
                    {step2Loading && (
                      <div className="flex justify-start animate-fade-in">
                        <div className="max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-[var(--bg-panel)] text-gray-500 dark:text-gray-400 italic">
                          Henter spørgsmål...
                        </div>
                      </div>
                    )}

                    {/* Step 2: bot question — shown once loading is done */}
                    {!step2Loading && (
                    <div className="flex justify-start">
                      <div className="max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-[var(--bg-panel)] text-gray-800 dark:text-gray-200">
                        {(dynamicStep2 ?? onboardingSteps[1]).question}
                      </div>
                    </div>
                    )}

                    {/* Step 2: option cards, write-yourself button, and helper — shown once loading is done */}
                    {!step2Loading && (
                      <>
                        <div className="flex flex-wrap gap-2">
                          {(dynamicStep2 ?? onboardingSteps[1]).options.map((option) => {
                            const isSelected = step2Answer === option
                            const isFaded = !!step2Answer && !isSelected
                            return (
                              <button
                                key={option}
                                onClick={() => !step2Answer && handleStep2Select(option)}
                                className={cardClasses(isSelected, isFaded, !step2Answer)}
                                style={cardStyle(isSelected, isFaded)}
                              >
                                {option}
                              </button>
                            )
                          })}
                        </div>
                        <div>
                          <button
                            onClick={() => textareaRef.current?.focus()}
                            className="border border-dashed border-[var(--border)] rounded-xl px-4 py-2 text-sm text-left transition-colors bg-[var(--bg-card)] hover:bg-[var(--bg-surface)] cursor-pointer"
                            style={{ color: 'var(--color-text-tertiary)', opacity: 0.7 }}
                          >
                            <em>Skriv noget selv</em>
                          </button>
                        </div>

                        {/* Helper text — only visible while onboarding is incomplete */}
                        {!onboardingComplete && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 pt-1">
                            Vælg en mulighed, eller skriv dit eget svar nedenfor
                          </p>
                        )}
                      </>
                    )}

                    {/* Student bubble for step 2 */}
                    {step2Answer && (
                      <div className="flex justify-end animate-fade-in">
                        <div className="max-w-[75%] rounded-2xl px-4 py-3 text-sm bg-gray-900 text-white">
                          {step2Answer}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Message history ──────────────────────────────────────────────────
            Re-engagement sections are rendered as siblings after the message
            that triggered them (afterIndex === idx), so they always appear
            between the student's looping message and the bot's response. */}
        {messages.map((msg, idx) => (
          <Fragment key={idx}>
            {!msg.isHidden && <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
            </div>}

            {/* Re-engagement section for this message index.
                afterIndex is stable per entry, so multiple re-engagements across
                a long conversation are each anchored to their triggering message. */}
            {reEngagements
              .filter((re) => re.afterIndex === idx)
              .map((re) => (
                <div key={re.afterIndex} className="space-y-3 animate-fade-in">
                  {/* Bot bubble — amber styling signals a meta/strategic moment */}
                  <div className="flex justify-start">
                    <div className="max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed border bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200">
                      Det ser ud til at vi er gået lidt i stå — det sker! Hvad ville hjælpe dig mest lige nu?
                    </div>
                  </div>

                  {/* Option cards */}
                  <div className="flex flex-wrap gap-2">
                    {RE_ENGAGEMENT_OPTIONS.map((option) => {
                      const isSelected = re.selectedOption === option
                      const isFaded = !!re.selectedOption && !isSelected
                      return (
                        <button
                          key={option}
                          onClick={() =>
                            !re.selectedOption &&
                            handleReEngagementSelect(option, re.afterIndex)
                          }
                          className={cardClasses(isSelected, isFaded, !re.selectedOption, 'amber')}
                          style={cardStyle(isSelected, isFaded)}
                        >
                          {option}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
          </Fragment>
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
            placeholder={inputPlaceholder}
            disabled={inputDisabled}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-input)] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
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
