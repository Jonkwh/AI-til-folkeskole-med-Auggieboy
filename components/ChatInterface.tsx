/**
 * ChatInterface.tsx — The central client-side component of the ThinkBot application.
 *
 * This file exports a single default React component, `ChatInterface`, that owns
 * the full student interaction lifecycle for one chat session:
 *
 *   1. ONBOARDING — For new sessions (no prior messages), two sequential multiple-choice
 *      questions are fetched from /api/onboarding and displayed as card options. The
 *      student's answers are assembled into a hidden [STUDENT CONTEXT: ...] string that
 *      is prepended to the first real API call. Both steps also accept free-text input
 *      via the textarea. A dynamically generated step 2 is requested when the student
 *      types free text at step 1 instead of picking a card.
 *
 *   2. CHAT — Standard turn-based conversation with Claude, streamed over a
 *      Server-Sent Events–style fetch from /api/chat. Student messages and assistant
 *      responses are persisted to Supabase after each turn.
 *
 *   3. LOOP DETECTION — After every bot response, the last two student messages are
 *      compared using a Jaccard word-overlap score. A score above LOOP_SIMILARITY_THRESHOLD
 *      sets isLooping=true. Three consecutive short, low-information messages also trigger
 *      the loop flag. When the flag is set, the next student submission is intercepted and
 *      a RE-ENGAGEMENT CARD is rendered inline instead of calling the API.
 *
 *   4. RE-ENGAGEMENT — When a student selects an option on the re-engagement card,
 *      handleReEngagementSelect appends a one-shot INTERNAL NOTE to the system prompt
 *      and then calls the API. The card locks immediately; the cooldown ref prevents
 *      back-to-back card appearances.
 *
 *   5. RATE LIMITING — Client-side only: more than 5 messages in a 10-second rolling
 *      window shows a warning and blocks new submissions until the window clears.
 *
 *   6. ASSIGNMENT BLOCKING — Client-side regex guard: messages matching Danish
 *      assignment-writing patterns are rejected before reaching the API.
 *
 * Exports:
 *   - default ChatInterface (React functional component)
 *
 * How it fits in the app:
 *   - Rendered by the chat page (app/session/[id]/page.tsx) which passes pre-loaded
 *     session data as props, avoiding an extra client-side fetch on load.
 *   - Talks to /api/chat (streaming) and /api/onboarding (JSON) on the server.
 *   - Persists data to Supabase tables: messages, chat_sessions.
 *   - Renders ShareButton and MasterpromptCard as sibling components.
 */

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

/**
 * Message is a TypeScript interface that defines the shape of a single chat message,
 * used for both local React state entries and rows read from/written to the Supabase
 * `messages` table.
 */
interface Message {
  id?: string // Supabase-generated UUID, only present for messages already saved to the database.
  role: 'user' | 'assistant'
  content: string
  created_at?: string // ISO timestamp — present for persisted messages, absent for optimistic local messages.
  isError?: boolean // True for bot messages that represent an API failure rather than a real response.
  isHidden?: boolean // True for onboarding summary messages shown as student bubbles but not rendered in the chat feed.
}

/**
 * OnboardingStep is a TypeScript interface that defines the shape of a single step
 * in the two-question onboarding flow — a question string paired with an array of
 * pre-generated option labels the student can tap instead of typing.
 */
interface OnboardingStep {
  question: string
  options: string[]
}

/**
 * ReEngagementEntry is a TypeScript interface that defines the shape of one
 * re-engagement card event. Each entry is anchored by afterIndex so the card
 * renders inline at the correct position in the message list even as more
 * messages are appended later.
 *
 * Tracks a re-engagement card shown when the student appears to be looping.
 * afterIndex pins the card to a specific position in the message list so it stays inline even as more messages arrive.
 */
interface ReEngagementEntry {
  afterIndex: number // The index of the student message that triggered the re-engagement card.
  selectedOption: string | null // The option the student chose, or null while the card is still active.
}

/**
 * ChatInterfaceProps is a TypeScript interface that defines the shape of the props
 * passed from the server-rendered chat page to this client component. All values
 * are fetched server-side so the component can render synchronously on first paint.
 *
 * Props passed from the server-rendered chat page to this client component.
 */
interface ChatInterfaceProps {
  sessionId: string // The Supabase session ID — used to save new messages to the correct session.
  masterprompt: string // The teacher's configured system prompt — sent to Claude on every API request.
  initialMessages: Message[] // Messages already stored in the database, pre-loaded server-side to avoid a client fetch.
  sessionTitle: string // The current title shown in the chat header.
}

// RATE_LIMIT_WINDOW is a number constant representing the rolling time window (in milliseconds)
// used by the client-side rate limiter. Set to 10 000 ms (10 seconds).
// A message is considered "rate-limited" if the student sends more than 5 messages within a 10-second window.
const RATE_LIMIT_WINDOW = 10_000 // 10 seconds

// RATE_LIMIT_MAX is a number constant representing the maximum number of messages
// allowed within one RATE_LIMIT_WINDOW before submissions are blocked.
const RATE_LIMIT_MAX = 5

// LOOP_SIMILARITY_THRESHOLD is a number constant (0–1 Jaccard score) above which
// two consecutive student messages are considered a repeating/looping pattern,
// triggering the re-engagement card flow.
// Two student messages with a Jaccard word-overlap score above this threshold are treated as a looping pattern.
const LOOP_SIMILARITY_THRESHOLD = 0.7

// RE_ENGAGEMENT_OPTIONS is an array of string constants listing the four choices
// presented on the re-engagement card when loop detection fires. Each string is
// also used as the lookup key into RE_ENGAGEMENT_PROMPTS.
// The four options shown on the re-engagement card when the student is detected as looping.
const RE_ENGAGEMENT_OPTIONS = [
  'Giv mig et hint',
  'Prøv et nyt spørgsmål',
  'Forklar konceptet',
  'Start forfra',
]

// RE_ENGAGEMENT_PROMPTS is a Record<string, string> object (keyed by RE_ENGAGEMENT_OPTIONS values)
// that maps each re-engagement card option to an internal instruction appended to the system
// prompt for the single API call that follows card selection. The note overrides Claude's
// default scaffolding behaviour for that one response only and is never stored or shown to
// the student.
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

// ONBOARDING_FALLBACK is an array of OnboardingStep objects used as a fallback when the
// /api/onboarding request fails or returns an unexpected shape. Guarantees the onboarding
// UI always has two valid steps to display.
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

// ASSIGNMENT_PATTERNS is an array of RegExp objects. Each regex matches a Danish phrase
// that requests Claude to write or complete an assignment on the student's behalf.
// If any pattern matches the student's message in handleSubmit, the message is blocked
// client-side and an explanatory hint is shown below the input.
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

// LOW_INFO_PATTERNS is a RegExp that matches short, vague, or uninformative Danish responses
// such as "ved ikke", "hva", or single-word replies. Used by isLowInfo() and by the
// loop-detection logic in callChatAPI to identify students who are stuck rather than looping.
// Patterns that indicate a low-information student response (e.g. "ved ikke", "hva", single word).
const LOW_INFO_PATTERNS = /ved\s+(det\s+)?ikke|forstår\s+(det\s+)?ikke|ingen\s+ide|ikke\s+sikker|^nej$|^hvad$|^hva$/i

/**
 * isLowInfo is a function that takes 1 parameter (msg: string) and returns boolean.
 *
 * Returns true if a message carries little informational content — specifically if the
 * trimmed message is 15 characters or fewer, matches LOW_INFO_PATTERNS, or contains
 * no whitespace (single token). Used in two places:
 *   - callChatAPI: loop detection for three consecutive short messages
 *   - handleSubmit: clears the stale loop flag when the student writes something substantive
 *
 * Returns true if a message carries little informational content.
 * Used by both the 30-character loop check and the handleSubmit early reset.
 */
function isLowInfo(msg: string): boolean {
  const t = msg.trim()
  return t.length <= 15 || LOW_INFO_PATTERNS.test(t) || !/\s/.test(t)
}

/**
 * wordOverlapSimilarity is a function that takes 2 parameters (a: string, b: string)
 * and returns a number between 0 and 1 representing the Jaccard similarity coefficient
 * between the two messages' word sets.
 *
 * Algorithm steps:
 *   1. Tokenise both strings: lowercase, strip punctuation, split on whitespace, filter
 *      tokens shorter than 3 characters.
 *   2. If either token list is empty, return 0 (no meaningful comparison possible).
 *   3. Build a Set from wordsB for O(1) lookup.
 *   4. Compute intersection: words present in both lists.
 *   5. Compute union: all unique words across both lists (manual dedup to avoid Set spread).
 *   6. Return intersection.length / union.length (Jaccard index).
 *
 * A value above LOOP_SIMILARITY_THRESHOLD indicates the student is repeating themselves.
 * Avoids Set spread to stay compatible with the project's TS/target config.
 *
 * Jaccard similarity between two messages based on word overlap. Returns 0-1.
 * A value above LOOP_SIMILARITY_THRESHOLD indicates the student is repeating themselves.
 * Avoids Set spread to stay compatible with the project's TS/target config.
 */
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
  return intersection / union // Jaccard index: intersection / union.
}

/**
 * ChatInterface is a function that takes 4 parameters
 * (sessionId: string, masterprompt: string, initialMessages: Message[], sessionTitle: string)
 * and returns JSX.Element (a React functional component).
 *
 * It is the main chat component. Handles the full student interaction: onboarding, message submission,
 * streaming responses, loop detection, re-engagement cards, rate limiting, and database persistence.
 */
export default function ChatInterface({
  sessionId,
  masterprompt,
  initialMessages,
  sessionTitle,
}: ChatInterfaceProps) {
  // supabase is the browser-side Supabase client instance used to persist messages and update session titles.
  const supabase = createClient() // Browser-side Supabase client used to persist messages.

  // messages is an array of Message objects representing the full conversation history
  // displayed in the chat feed. Initialised with server-pre-loaded messages so the UI
  // renders without a client-side loading state.
  const [messages, setMessages] = useState<Message[]>(initialMessages) // The conversation history shown in the chat feed.

  // input is a string state variable holding the current value typed into the textarea.
  const [input, setInput] = useState('') // The current value in the text input area.

  // isStreaming is a boolean state variable that is true while a streaming fetch to /api/chat
  // is in progress. Used to disable the send button and show the blinking cursor.
  const [isStreaming, setIsStreaming] = useState(false) // True while a streaming response from Claude is in progress.

  // title is a string state variable holding the session title displayed in the chat header.
  // Derived from the first message; updated immediately (optimistic) then persisted to Supabase.
  const [title, setTitle] = useState(sessionTitle) // The session title shown in the chat header — updated after the first message.

  // rateLimited is a boolean state variable that is true when the student has exceeded
  // RATE_LIMIT_MAX messages in RATE_LIMIT_WINDOW milliseconds. Cleared automatically.
  const [rateLimited, setRateLimited] = useState(false) // True when the student has sent too many messages too quickly.

  // assignmentBlocked is a boolean state variable that is true when the student's last
  // message matched one of the ASSIGNMENT_PATTERNS regexes. Cleared when the student
  // modifies the textarea.
  const [assignmentBlocked, setAssignmentBlocked] = useState(false) // True when the student's message matched an assignment-writing pattern.

  // messagesEndRef is a ref to an invisible div rendered at the bottom of the message list.
  // Scrolled into view whenever the messages array or onboarding state changes.
  const messagesEndRef = useRef<HTMLDivElement>(null) // Invisible div at the bottom of the message list — scrolled into view on new messages.

  // textareaRef is a ref to the textarea element. Used to focus the input when
  // the student clicks "Skriv noget selv" during onboarding.
  const textareaRef = useRef<HTMLTextAreaElement>(null) // Reference to the text input — used to focus it when "Skriv noget selv" is clicked.

  // messageTimestamps is a ref holding an array of number timestamps (Date.now() values)
  // for messages sent within the current rate-limit window. Stored in a ref (not state)
  // so mutations don't trigger re-renders.
  const messageTimestamps = useRef<number[]>([]) // Rolling list of timestamps for messages sent in the current window — used for rate limiting.

  // isLooping is a boolean ref (not state) that tracks whether the student appears to be
  // looping. Set after each bot response, read on the next send, and cleared automatically
  // when topics diverge. Stored in a ref to avoid stale closure issues in async handlers.
  // Tracks whether the student appears to be looping. Set after each bot response,
  // read on the next send, and cleared automatically when topics diverge.
  const isLooping = useRef(false)

  // reEngagementCooldownRef is a number ref counting how many more student messages
  // must pass before isLooping can be set to true again. Decremented once per bot
  // response while positive. Set to 2 when a re-engagement card is selected to
  // prevent consecutive card appearances.
  // Blocks isLooping from being set to true for N more student messages after a
  // re-engagement card is selected, preventing back-to-back card appearances.
  const reEngagementCooldownRef = useRef(0)

  // isNewChat is a boolean constant that is true when this session has no prior messages.
  // Determines whether the onboarding flow is shown and whether onboardingComplete starts as false.
  const isNewChat = initialMessages.length === 0 // True when this session has no prior messages — enables the onboarding flow.

  // ── Onboarding ─────────────────────────────────────────────────────────────

  // onboardingFetchedRef is a boolean ref set synchronously before the first async tick
  // to prevent double-fetching in React Strict Mode's double-invocation of effects.
  // onboardingFetchedRef is set synchronously before the first async tick to
  // prevent double-fetching in React Strict Mode's double-invocation of effects.
  const onboardingFetchedRef = useRef(false)

  // step2FetchedRef is a boolean ref that guards the dynamic step 2 fetch triggered
  // by free-text step 1 submission. Prevents duplicate requests if the effect re-runs.
  // Guards the dynamic step 2 fetch triggered by free-text step 1 submission.
  const step2FetchedRef = useRef(false)

  // studentContextRef is a string ref holding the assembled [STUDENT CONTEXT: ...] string
  // until it is injected into the first real API call, after which it is cleared to ''
  // so subsequent calls do not re-inject it.
  // Holds the assembled [STUDENT CONTEXT: ...] string until it is injected into
  // the first real API call, after which it is no longer read.
  const studentContextRef = useRef('')

  // onboardingSteps is an array of OnboardingStep objects (or null while loading).
  // Populated by the /api/onboarding fetch; falls back to ONBOARDING_FALLBACK on error.
  const [onboardingSteps, setOnboardingSteps] = useState<OnboardingStep[] | null>(null)

  // onboardingLoading is a boolean state variable that is true while the initial
  // /api/onboarding request is in flight. Initialised to true for new chats so the
  // "Henter spørgsmål..." placeholder renders immediately on mount.
  // Start in loading state for new chats so the placeholder renders immediately.
  const [onboardingLoading, setOnboardingLoading] = useState(isNewChat)

  // step1Answer is a string state variable (or null) holding the student's answer to
  // the first onboarding question — either a card label or free-text input.
  const [step1Answer, setStep1Answer] = useState<string | null>(null)

  // step2Answer is a string state variable (or null) holding the student's answer to
  // the second onboarding question — either a card label or free-text input.
  const [step2Answer, setStep2Answer] = useState<string | null>(null)

  // onboardingComplete is a boolean state variable that is false during the two-step
  // onboarding flow and true once both answers have been submitted. Initialised to true
  // for returning users (no onboarding needed).
  // Initialised to true for returning users (no onboarding needed).
  const [onboardingComplete, setOnboardingComplete] = useState(!isNewChat)

  // dynamicStep2 is an OnboardingStep object (or null) holding a dynamically generated
  // step 2 question fetched when the student typed free text at step 1. When null, the
  // component falls back to the pre-generated onboardingSteps[1].
  // Holds the dynamically generated step 2 when the student typed free text at step 1.
  // Null means card selection was used — fall back to pre-generated onboardingSteps[1].
  const [dynamicStep2, setDynamicStep2] = useState<OnboardingStep | null>(null)

  // step2Loading is a boolean state variable that is true while the dynamic step 2
  // question is being fetched from /api/onboarding after free-text step 1 submission.
  const [step2Loading, setStep2Loading] = useState(false)

  // ── Re-engagement ───────────────────────────────────────────────────────────

  // reEngagements is an array of ReEngagementEntry objects tracking every re-engagement
  // card event in this session. Each entry is anchored to a message index so the card
  // renders inline in the correct position even after more messages are appended.
  // Each entry is positioned at a specific index in the messages array so the
  // re-engagement UI renders inline between the student's looping message and
  // the subsequent bot response, regardless of how many messages follow.
  const [reEngagements, setReEngagements] = useState<ReEngagementEntry[]>([])

  // activeReEngagement is a ReEngagementEntry object (or null) representing the one
  // re-engagement card that is currently awaiting a student selection (selectedOption === null).
  // At most one card can be active at a time; once selected it is locked and a new card
  // may appear only after the cooldown expires.
  const activeReEngagement = reEngagements.find((re) => re.selectedOption === null) ?? null

  // ── Fetch onboarding questions once per new chat ────────────────────────────
  // This effect runs once on mount for new chats. It fetches two onboarding questions
  // from /api/onboarding, slices to at most 2 steps, and falls back to ONBOARDING_FALLBACK
  // on any failure. The onboardingFetchedRef guard prevents double-fetching under React
  // Strict Mode's double effect invocation.
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

  // Scrolls the invisible sentinel div into view whenever the message list, onboarding
  // state, or re-engagement list changes — keeps the most recent content visible.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, onboardingSteps, step1Answer, step2Answer, reEngagements])

  // Auto-expands the textarea height as the student types, capped at 150 px to prevent
  // the input area from consuming too much vertical space.
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px'
    }
  }, [input])

  /**
   * checkRateLimit is a function that takes 0 parameters and returns boolean.
   *
   * Returns true if the current message is within the allowed rate, or false if the
   * student has exceeded RATE_LIMIT_MAX messages in the last RATE_LIMIT_WINDOW milliseconds.
   *
   * Algorithm:
   *   1. Prune messageTimestamps to only those within the current window.
   *   2. If the pruned list already has RATE_LIMIT_MAX entries, set rateLimited=true,
   *      schedule an auto-clear timeout for when the oldest entry expires, and return false.
   *   3. Otherwise, push the current timestamp and return true.
   *
   * Enforced client-side to give instant feedback without a round trip to the server.
   * Checks whether the student has exceeded the rate limit. Returns true if the message is allowed.
   */
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

  /**
   * updateSessionTitle is a function that takes 1 parameter (firstMessage: string)
   * and returns Promise<void>.
   *
   * Derives a display title by taking the first 40 characters of firstMessage (with
   * a trailing '...' when truncated) and writes it to both React state (immediate) and
   * the Supabase chat_sessions table (async). Em dashes are normalised to hyphens first.
   *
   * Updates the session title in both React state and the database using the first 40 characters of the message.
   * The '...' suffix is added when the message is longer than 40 characters to indicate truncation.
   */
  async function updateSessionTitle(firstMessage: string) {
    const sanitized = firstMessage.replace(/—/g, '-') // Normalises em dashes for consistency.
    const newTitle = sanitized.slice(0, 40) + (sanitized.length > 40 ? '...' : '')
    setTitle(newTitle) // Updates the header immediately without waiting for the database write.
    await supabase
      .from('chat_sessions')
      .update({ title: newTitle })
      .eq('id', sessionId)
  }

  /**
   * saveMessage is a function that takes 2 parameters (role: 'user' | 'assistant', content: string)
   * and returns Promise<void>.
   *
   * Inserts a single row into the Supabase `messages` table, linking it to the current
   * session via sessionId. Called after every student message and after every completed
   * bot streaming response.
   *
   * Persists a single message to the Supabase messages table.
   * Called after every student message and after every completed bot response.
   */
  async function saveMessage(role: 'user' | 'assistant', content: string) {
    await supabase.from('messages').insert({
      session_id: sessionId, // Links the message to the correct session.
      role,
      content,
    })
  }

  // ── Core API call ───────────────────────────────────────────────────────────

  /**
   * callChatAPI is a function that takes 3 parameters:
   *   - conversationMessages: { role: string; content: string }[]  — the full message history to send
   *   - systemPromptOverride?: string                              — optional one-shot system prompt (re-engagement)
   *   - restoreInputOnError?: string                               — optional string to restore the textarea on failure
   * and returns Promise<void>.
   *
   * This is the core API call that powers both normal chat turns and re-engagement
   * responses. It is extracted so handleSubmit and handleReEngagementSelect share
   * the same streaming/error handling code.
   *
   * Streaming algorithm:
   *   1. Set isStreaming=true and append an empty assistant message to messages state.
   *   2. POST to /api/chat with the message history, system prompt, and the current
   *      isLooping flag (suppressed when systemPromptOverride is set).
   *   3. On non-OK response: replace the placeholder with an error message and optionally
   *      restore the textarea.
   *   4. On OK: stream chunks via ReadableStream, appending each decoded chunk to fullContent
   *      and updating the last message in state in real time.
   *   5. After streaming completes: persist the full response via saveMessage.
   *   6. Run loop detection (see block comment below).
   *   7. On network error: replace the placeholder with a connectivity error message.
   *   8. Finally: set isStreaming=false.
   *
   * Loop detection algorithm (runs after step 5):
   *   Pass A — Jaccard similarity check:
   *     - Filter conversationMessages to user-only entries.
   *     - If there are fewer than 2 user messages, clear isLooping and skip.
   *     - If either of the last two user messages is 15 chars or shorter (direct short
   *       reply to a question, not a loop), clear isLooping and skip.
   *     - Otherwise compute wordOverlapSimilarity on the last two user messages.
   *     - If score > LOOP_SIMILARITY_THRESHOLD: decrement cooldown or set isLooping=true.
   *     - If score <= threshold: clear isLooping.
   *   Pass B — consecutive short/low-info check:
   *     - If there are at least 3 user messages and all of the last 3 are under 30 chars,
   *       count how many are low-information (isLowInfo). If >= 2: decrement cooldown or
   *       set isLooping=true.
   *
   * Extracted so both handleSubmit and handleReEngagementSelect can call it.
   * systemPromptOverride: used by re-engagement to append a one-shot INTERNAL NOTE.
   *   When set, isLooping is sent as false (the note already handles the strategy).
   * restoreInputOnError: when provided, restores the textarea on API failure so
   *   the student can resend without retyping.
   */
  async function callChatAPI(
    conversationMessages: { role: string; content: string }[],
    systemPromptOverride?: string,
    restoreInputOnError?: string,
  ) {
    setIsStreaming(true)
    // assistantMsg is a Message object used as the optimistic placeholder appended to the
    // messages array before the first streamed chunk arrives.
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
        // status is a number holding the HTTP response status code from /api/chat.
        const status = response.status
        console.error(`Chat API returned ${status}`)
        // errorMessage is a string constant holding the Danish-language error text shown to the student.
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

      // reader is a ReadableStreamDefaultReader that yields streamed UTF-8 chunks from
      // the /api/chat response body.
      const reader = response.body?.getReader()
      // decoder is a TextDecoder instance used to convert Uint8Array chunks to strings.
      const decoder = new TextDecoder()
      // fullContent is a string accumulator that collects all streamed chunks into the
      // complete assistant response, persisted to Supabase after streaming finishes.
      let fullContent = ''

      if (reader) {
        // Stream reading loop: reads chunks until the stream signals done=true,
        // decoding each chunk and appending it to fullContent while updating UI state.
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          // chunk is a string containing one decoded segment of the streamed response,
          // with em dashes normalised to hyphens for consistency.
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

      /*
       * ── Loop detection ──────────────────────────────────────────────────────
       *
       * After each completed bot response, two independent passes check whether
       * the student appears to be looping. Either pass can set isLooping.current=true,
       * which will intercept the student's next submission and show a re-engagement card.
       *
       * Pass A — Jaccard similarity between the last two user messages:
       *   - If either message is 15 chars or shorter it is almost certainly a direct
       *     answer to a question, not a loop — skip and clear the flag.
       *   - If Jaccard score > LOOP_SIMILARITY_THRESHOLD AND cooldown is exhausted:
       *     set isLooping=true.
       *
       * Pass B — Three consecutive short/low-information messages:
       *   - Requires at least 3 user messages.
       *   - All three must be under 30 characters.
       *   - At least 2 of the 3 must pass isLowInfo().
       *   - If both conditions are met AND cooldown is exhausted: set isLooping=true.
       */

      // userMsgs is an array of message objects filtered to only user-role entries,
      // used as input for both loop detection passes.
      const userMsgs = conversationMessages.filter((m) => m.role === 'user')

      // ── Pass A: Jaccard similarity check ────────────────────────────────────
      if (userMsgs.length >= 2) {
        // last and secondLast are string constants holding the content of the two most
        // recent user messages, used to compute the Jaccard similarity score.
        const last = userMsgs[userMsgs.length - 1].content
        const secondLast = userMsgs[userMsgs.length - 2].content
        // Short responses (<=15 chars) are almost always direct replies to a
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

      // ── Pass B: consecutive short/low-info check ─────────────────────────────
      // Also trigger loop detection if the last 3 student messages are all under
      // 30 characters AND at least 2 of them are low-information. This prevents
      // false positives from short but substantive answers.
      if (userMsgs.length >= 3) {
        // lastThree is an array of the 3 most recent user message objects, used to
        // check for consecutive short/low-information responses.
        const lastThree = userMsgs.slice(-3)
        // allShort is a boolean constant that is true when every message in lastThree
        // is under 30 characters.
        const allShort = lastThree.every((m) => m.content.length < 30)
        if (allShort) {
          // lowInfoCount is a number constant representing how many of the last 3
          // user messages are considered low-information by isLowInfo().
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

  /**
   * handleStep1Select is a function that takes 1 parameter (option: string) and returns void.
   *
   * Called when the student clicks one of the step 1 option cards. Records the selected
   * label in step1Answer state, which locks the cards and reveals the step 2 question.
   */
  function handleStep1Select(option: string) {
    setStep1Answer(option)
  }

  /**
   * handleStep2Select is a function that takes 1 parameter (option: string) and returns Promise<void>.
   *
   * Called when the student clicks one of the step 2 option cards. Completes the onboarding
   * flow by:
   *   1. Recording the selected label in step2Answer state (locks the cards).
   *   2. Assembling the [STUDENT CONTEXT: ...] string from both answers.
   *   3. Clearing studentContextRef (marks context as consumed).
   *   4. Setting onboardingComplete=true.
   *   5. Appending a hidden student bubble to messages and persisting it to Supabase.
   *   6. Updating the session title with the combined display label.
   *   7. Firing the first API call with only the context string as the user message.
   */
  async function handleStep2Select(option: string) {
    if (!onboardingSteps || !step1Answer) return
    setStep2Answer(option)
    // activeStep2 is an OnboardingStep object — either the dynamic step 2 (when the
    // student typed free text at step 1) or the pre-generated second step.
    const activeStep2 = dynamicStep2 ?? onboardingSteps[1]
    // context is a string constant holding the full [STUDENT CONTEXT: ...] payload
    // sent to the API as the sole user message for the first call.
    // Full context string — sent to the API only, never stored or rendered.
    const context = `[STUDENT CONTEXT: ${onboardingSteps[0].question}: ${step1Answer}. ${activeStep2.question}: ${option}.]`
    // Mark as consumed so handleSubmit never injects it on a subsequent call.
    studentContextRef.current = ''
    setOnboardingComplete(true)

    // displayLabel is a string constant combining both answers for display in the
    // student bubble and for the session title. Never includes the raw context brackets.
    // Display label shown in the student bubble and saved to Supabase.
    // The raw bracketed context string is API-only.
    const displayLabel = `${step1Answer} - ${option}`
    // newUserMsg is a Message object representing the hidden student bubble that
    // summarises the onboarding answers — rendered in the feed but marked isHidden=true
    // so it does not appear as a normal chat bubble.
    const newUserMsg: Message = { role: 'user', content: displayLabel, created_at: new Date().toISOString(), isHidden: true }
    setMessages((prev) => [...prev, newUserMsg])
    await saveMessage('user', displayLabel)
    updateSessionTitle(displayLabel)

    // Fire immediately with the context string as the sole user message.
    // messages state is empty at this point — no prior messages to include.
    await callChatAPI([{ role: 'user', content: context }])
  }

  // ── Re-engagement handler ───────────────────────────────────────────────────

  /**
   * handleReEngagementSelect is a function that takes 2 parameters
   * (option: string, afterIndex: number) and returns Promise<void>.
   *
   * Called when the student clicks an option on a re-engagement card.
   *   1. Marks the card as selected immediately (locks the UI before the API call).
   *   2. Clears isLooping and sets a cooldown of 2 bot responses before the next
   *      re-engagement card can appear.
   *   3. Appends the per-option INTERNAL NOTE from RE_ENGAGEMENT_PROMPTS to the
   *      system prompt for this single call only.
   *   4. Calls callChatAPI with the full current messages array and the augmented prompt.
   */
  async function handleReEngagementSelect(option: string, afterIndex: number) {
    // Mark the selected card immediately so the UI locks before the API call.
    setReEngagements((prev) =>
      prev.map((re) => (re.afterIndex === afterIndex ? { ...re, selectedOption: option } : re))
    )
    isLooping.current = false
    reEngagementCooldownRef.current = 2

    // systemPromptWithNote is a string constant holding the teacher's masterprompt with
    // the one-shot INTERNAL NOTE appended. Used only for this single callChatAPI invocation.
    // Append the per-choice instruction to the system prompt for this single
    // call only. It is not stored and does not affect any subsequent calls.
    const systemPromptWithNote = masterprompt + (RE_ENGAGEMENT_PROMPTS[option] ?? '')

    // allMessages is an array of plain { role, content } objects derived from the current
    // messages state, passed as the conversation history to callChatAPI.
    // messages state at this point includes the pending student message that
    // triggered the re-engagement (added in handleSubmit before returning).
    const allMessages = messages.map((m) => ({ role: m.role, content: m.content }))
    await callChatAPI(allMessages, systemPromptWithNote)
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  /**
   * handleSubmit is a function that takes 1 parameter (e: React.FormEvent) and returns Promise<void>.
   *
   * The main form submission handler. Orchestrates:
   *   - Early exits: empty input, streaming in progress, rate limited, assignment blocked,
   *     active re-engagement card waiting for selection.
   *   - Rate limit check via checkRateLimit().
   *   - Assignment pattern guard via ASSIGNMENT_PATTERNS.
   *   - Onboarding free-text path:
   *       * Step 1 free text: records answer, triggers dynamic step 2 fetch.
   *       * Step 2 free text: assembles context, completes onboarding, fires API.
   *   - Normal chat path:
   *       * Updates session title on the first message.
   *       * Appends the user message optimistically and persists it.
   *       * Clears the stale loop flag if the message is substantive.
   *       * If isLooping is true: adds a re-engagement entry and returns (no API call).
   *       * Otherwise: injects studentContextRef on the first call if present, then
   *         calls callChatAPI with the full conversation history.
   */
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

    // userMessage is a string constant holding the trimmed, em-dash-normalised text
    // the student submitted. Used for display, persistence, and API payload.
    const userMessage = input.trim().replace(/—/g, '-')

    // Client-side guardrail: check for assignment writing requests
    if (ASSIGNMENT_PATTERNS.some((p) => p.test(userMessage))) {
      setAssignmentBlocked(true)
      return
    }

    /*
     * ── Onboarding free-text submission state machine ──────────────────────
     *
     * When the student types free text instead of clicking a card during onboarding,
     * handleSubmit intercepts the message at whichever step is currently incomplete:
     *
     * State: onboardingComplete=false, step1Answer=null
     *   Action: record the typed text as step1Answer, clear the input, request a
     *   dynamic step 2 question tailored to what the student wrote, and return early.
     *
     * State: onboardingComplete=false, step1Answer set, step2Answer=null
     *   Action: treat the typed text as the step 2 answer, assemble the full context
     *   string, mark onboarding complete, append a hidden user bubble, persist it,
     *   update the session title, fire the first API call, and return early.
     *
     * In both cases the normal chat path below is skipped entirely.
     */

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
        // activeStep2 is an OnboardingStep object — either the dynamic or pre-generated step 2.
        const activeStep2 = dynamicStep2 ?? onboardingSteps[1]
        // context is a string constant holding the [STUDENT CONTEXT: ...] payload for the API call.
        const context = `[STUDENT CONTEXT: ${onboardingSteps[0].question}: ${step1Answer}. ${activeStep2.question}: ${userMessage}.]`
        setStep2Answer(userMessage)
        setOnboardingComplete(true)
        setInput('')
        // displayLabel is a string constant combining both onboarding answers for the student bubble.
        const displayLabel = `${step1Answer} — ${userMessage}`
        // newHiddenMsg is a Message object for the hidden student bubble summarising both answers.
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

    // newUserMsg is a Message object for the optimistic student bubble added to messages
    // state before the API response arrives. The raw display text is stored — no context prefix.
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
      // afterIndex is a number constant representing the position of the student's
      // looping message in the messages array — used to anchor the re-engagement card.
      const afterIndex = messages.length
      setReEngagements((prev) => [...prev, { afterIndex, selectedOption: null }])
      return
    }

    // Inject context into the API payload for the first call only.
    // messages.length is the stale closure value — still 0 at this point.
    // apiContent is a string constant holding either the plain userMessage or the
    // context-prefixed version (first call of a session where onboarding was skipped).
    const apiContent =
      messages.length === 0 && studentContextRef.current
        ? `${studentContextRef.current}\n\n${userMessage}`
        : userMessage
    if (messages.length === 0) studentContextRef.current = ''

    // allMessages is an array of plain { role, content } objects representing the full
    // conversation history including the new user message, sent to callChatAPI.
    const allMessages = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: apiContent },
    ]
    await callChatAPI(allMessages, undefined, userMessage)
  }

  /**
   * handleKeyDown is a function that takes 1 parameter (e: React.KeyboardEvent) and returns void.
   *
   * Intercepts Enter keypresses in the textarea. If Enter is pressed without Shift,
   * the default newline insertion is prevented and handleSubmit is called instead.
   * Shift+Enter still inserts a newline as expected.
   *
   * Submits the form when the student presses Enter without Shift (Shift+Enter inserts a newline instead).
   */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault() // Prevents the default newline insertion in the textarea.
      handleSubmit(e)
    }
  }

  // sendDisabled is a boolean constant that is true when the send button should be
  // non-interactive: input is empty, streaming is in progress, rate limit is active,
  // or a re-engagement card is waiting for a selection.
  // The send button is disabled while streaming, rate-limited, or when a re-engagement card is waiting for a selection.
  const sendDisabled =
    !input.trim() || isStreaming || rateLimited || !!activeReEngagement

  // inputDisabled is a boolean constant that is true when the textarea should be
  // non-interactive: a re-engagement card is active or streaming is in progress.
  // The text input is disabled during streaming and while a re-engagement card is active.
  const inputDisabled = !!activeReEngagement || isStreaming

  // inputPlaceholder is a string constant holding the context-sensitive placeholder text
  // shown in the textarea, adapting to the current onboarding step or interaction state.
  // The placeholder text adapts to the current interaction state to guide the student.
  const inputPlaceholder = !onboardingComplete
    ? step1Answer
      ? 'Eller skriv dit eget svar...' // Step 2 of onboarding — the student can type instead of picking a card.
      : 'Eller beskriv hvad du arbejder med...' // Step 1 of onboarding — invites free text.
    : activeReEngagement
    ? 'Vælg en mulighed ovenfor...' // Re-engagement card is showing — input is disabled.
    : 'Skriv din besked...' // Normal chat mode.

  // ── Shared card class builder ───────────────────────────────────────────────

  /**
   * cardClasses is a function that takes 4 parameters:
   *   - isSelected: boolean  — whether this card option has been chosen
   *   - isFaded: boolean     — whether a different option has been chosen (this one dims)
   *   - isPending: boolean   — whether the card group is still awaiting a selection
   *   - variant: 'default' | 'amber' — colour variant; 'amber' for re-engagement cards
   * and returns string (a Tailwind CSS class string).
   *
   * Returns the Tailwind class string for an option card given its selection state.
   * Centralises all card styling so onboarding cards and re-engagement cards share
   * the same visual logic.
   */
  function cardClasses(
    isSelected: boolean,
    isFaded: boolean,
    isPending: boolean,
    variant: 'default' | 'amber' = 'default',
  ): string {
    const base = 'border rounded-xl px-4 py-2 text-sm text-left transition-colors'
    // borderAndText is a string constant holding the variant-specific border and text colour classes.
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

  /**
   * cardStyle is a function that takes 2 parameters (isSelected: boolean, isFaded: boolean)
   * and returns React.CSSProperties | undefined.
   *
   * Returns an inline style object for an option card to apply selection highlighting
   * (dark navy background + white text) or reduced opacity for faded/unchosen cards.
   * Returns undefined when no inline style is needed (Tailwind classes suffice).
   */
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
                    // isSelected is a boolean constant: true if this card matches the student's step 1 answer.
                    const isSelected = step1Answer === option
                    // isFaded is a boolean constant: true if a different step 1 card was selected.
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
                            // isSelected is a boolean constant: true if this card matches the student's step 2 answer.
                            const isSelected = step2Answer === option
                            // isFaded is a boolean constant: true if a different step 2 card was selected.
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
                      // isSelected is a boolean constant: true if this re-engagement option was chosen.
                      const isSelected = re.selectedOption === option
                      // isFaded is a boolean constant: true if a different re-engagement option was chosen.
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
