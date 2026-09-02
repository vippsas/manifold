import React, { useCallback, useEffect, useState } from 'react'

import { THINKING_PHRASES } from './thinkingPhrases'

function pickRandom(phrases: string[], exclude: string): string {
  const filtered = phrases.filter((p) => p !== exclude)
  return filtered[Math.floor(Math.random() * filtered.length)]
}

export function ThinkingIndicator(): React.JSX.Element {
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
    const id = setInterval(rotate, 10000)
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
          data-testid="thinking-phrase"
          style={{
            fontSize: 14,
            fontWeight: 500,
            background: 'linear-gradient(90deg, var(--text-muted) 0%, var(--text-muted) 38%, var(--text) 50%, var(--text-muted) 62%, var(--text-muted) 100%)',
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
