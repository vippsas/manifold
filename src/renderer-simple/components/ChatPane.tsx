import React, { useState, useRef, useEffect } from 'react'
import type { ChatMessage as ChatMessageType } from '../../shared/simple-types'
import { ChatMessage } from './ChatMessage'
import * as styles from './ChatPane.styles'

const typingKeyframes = `
@keyframes typing-dot {
  0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-4px); }
}`

function TypingIndicator(): React.JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '12px 18px',
        borderRadius: 16,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--text-muted)',
              animation: `typing-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

interface Props {
  messages: ChatMessageType[]
  onSend: (text: string) => void
  isThinking?: boolean
}

export function ChatPane({ messages, onSend, isThinking }: Props): React.JSX.Element {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  const handleSend = (): void => {
    if (input.trim()) {
      onSend(input.trim())
      setInput('')
    }
  }

  return (
    <div style={styles.container}>
      <style>{typingKeyframes}</style>
      <div style={styles.messages}>
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isThinking && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>
      <div style={styles.inputRow}>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Tell the agent what to change..."
        />
        <button style={styles.sendButton} onClick={handleSend}>
          Send
        </button>
      </div>
    </div>
  )
}
