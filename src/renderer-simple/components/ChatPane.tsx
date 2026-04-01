import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import type { ChatMessage as ChatMessageType } from '../../shared/simple-types'
import { ChatMessage } from './ChatMessage'
import * as styles from './ChatPane.styles'

const INPUT_LINE_HEIGHT = 22
const INPUT_CHROME_HEIGHT = 26
const MAX_VISIBLE_LINES = 4
const MIN_INPUT_HEIGHT = INPUT_LINE_HEIGHT + INPUT_CHROME_HEIGHT
const MAX_INPUT_HEIGHT = INPUT_LINE_HEIGHT * MAX_VISIBLE_LINES + INPUT_CHROME_HEIGHT

const THINKING_PHRASES = [
  'Thinking',
  'Pondering',
  'Reasoning',
  'Connecting dots',
  'Weaving ideas',
  'Exploring paths',
  'Working through it',
  'Diving deep',
  'Piecing it together',
  'Mulling it over',
  'Crafting a response',
  'Mapping it out',
  'Almost there',
  'On it',
]

function pickRandom(phrases: string[], exclude: string): string {
  const filtered = phrases.filter((p) => p !== exclude)
  return filtered[Math.floor(Math.random() * filtered.length)]
}

function ThinkingIndicator(): React.JSX.Element {
  const [phrase, setPhrase] = useState(() =>
    THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)]
  )
  const [visible, setVisible] = useState(true)

  const rotate = useCallback(() => {
    setVisible(false)
    setTimeout(() => {
      setPhrase((prev) => pickRandom(THINKING_PHRASES, prev))
      setVisible(true)
    }, 400)
  }, [])

  useEffect(() => {
    const id = setInterval(rotate, 3000)
    return () => clearInterval(id)
  }, [rotate])

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
      }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'var(--accent)',
              animation: `typing-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            background: 'linear-gradient(90deg, var(--text-muted) 0%, var(--accent-hover) 50%, var(--text-muted) 100%)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'shimmer 2s linear infinite',
            opacity: visible ? 1 : 0,
            transition: 'opacity 0.4s ease',
          }}
        >
          {phrase}...
        </span>
      </div>
    </div>
  )
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function DurationBadge({ durationMs }: { durationMs: number }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
      <span style={{
        fontSize: 12,
        color: 'var(--text-muted)',
        padding: '4px 12px',
        borderRadius: 12,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}>
        Completed in {formatDuration(durationMs)}
      </span>
    </div>
  )
}

interface Props {
  messages: ChatMessageType[]
  onSend: (text: string) => void
  onInterrupt?: () => void
  isThinking?: boolean
  durationMs?: number | null
}

export function ChatPane({ messages, onSend, onInterrupt, isThinking, durationMs }: Props): React.JSX.Element {
  const [input, setInput] = useState('')
  const [dismissedOptions, setDismissedOptions] = useState<Set<string>>(new Set())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const pendingSelectionRef = useRef<number | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages, isThinking, durationMs])

  const syncInputHeight = useCallback((): void => {
    const textarea = inputRef.current
    if (!textarea) return

    textarea.style.height = `${MIN_INPUT_HEIGHT}px`
    const nextHeight = Math.min(textarea.scrollHeight, MAX_INPUT_HEIGHT)
    textarea.style.height = `${Math.max(MIN_INPUT_HEIGHT, nextHeight)}px`
    textarea.style.overflowY = textarea.scrollHeight > MAX_INPUT_HEIGHT ? 'auto' : 'hidden'
  }, [])

  useLayoutEffect(() => {
    syncInputHeight()

    if (pendingSelectionRef.current == null) return

    const textarea = inputRef.current
    if (!textarea) return

    textarea.setSelectionRange(pendingSelectionRef.current, pendingSelectionRef.current)
    pendingSelectionRef.current = null
  }, [input, syncInputHeight])

  const dismissAllOptions = (): void => {
    const ids = messages.filter(m => m.options && m.options.length > 0).map(m => m.id)
    if (ids.length > 0) {
      setDismissedOptions(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.add(id))
        return next
      })
    }
  }

  const handleSend = (): void => {
    const message = input.trim()
    if (message) {
      dismissAllOptions()
      onSend(message)
      setInput('')
    }
  }

  const insertLineBreak = (): void => {
    const textarea = inputRef.current
    if (!textarea) {
      setInput((current) => `${current}\n`)
      return
    }

    const selectionStart = textarea.selectionStart ?? input.length
    const selectionEnd = textarea.selectionEnd ?? input.length
    pendingSelectionRef.current = selectionStart + 1
    setInput((current) => `${current.slice(0, selectionStart)}\n${current.slice(selectionEnd)}`)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return

    e.preventDefault()
    if (e.shiftKey) {
      insertLineBreak()
      return
    }

    handleSend()
  }

  const handleOptionClick = (messageId: string, option: string): void => {
    setDismissedOptions(prev => new Set(prev).add(messageId))
    onSend(option)
  }

  return (
    <div style={styles.container}>
      <div style={styles.messages}>
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onOptionClick={(option) => handleOptionClick(msg.id, option)}
            hideOptions={dismissedOptions.has(msg.id)}
          />
        ))}
        {isThinking && <ThinkingIndicator />}
        {!isThinking && durationMs != null && durationMs > 0 && <DurationBadge durationMs={durationMs} />}
        <div ref={messagesEndRef} />
      </div>
      <div style={styles.inputRow}>
        <textarea
          ref={inputRef}
          style={styles.input}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Tell the agent what to change..."
        />
        <button
          style={isThinking ? styles.interruptButton : styles.sendButton}
          onClick={isThinking ? onInterrupt : handleSend}
        >
          {isThinking ? 'Interrupt' : 'Send'}
        </button>
      </div>
    </div>
  )
}
