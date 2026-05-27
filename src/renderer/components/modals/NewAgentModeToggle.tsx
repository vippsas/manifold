import React, { useCallback } from 'react'

export type NewAgentMode = 'interactive' | 'chat'

interface NewAgentModeToggleProps {
  value: NewAgentMode
  onChange: (mode: NewAgentMode) => void
}

const OPTIONS: { value: NewAgentMode; label: string }[] = [
  { value: 'interactive', label: 'Interactive' },
  { value: 'chat', label: 'Chat' },
]

export function NewAgentModeToggle({ value, onChange }: NewAgentModeToggleProps): React.JSX.Element {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const idx = OPTIONS.findIndex((o) => o.value === value)
      const next = (idx + (e.key === 'ArrowRight' ? 1 : -1) + OPTIONS.length) % OPTIONS.length
      onChange(OPTIONS[next].value)
    },
    [value, onChange],
  )

  return (
    <div role="radiogroup" aria-label="Agent mode" onKeyDown={handleKeyDown} style={styles.group}>
      {OPTIONS.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            style={{ ...styles.pill, ...(active ? styles.pillActive : null) }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  group: {
    display: 'flex',
    background: 'var(--surface-2)',
    borderRadius: 6,
    padding: 2,
    width: '100%',
  },
  pill: {
    flex: 1,
    padding: '6px 12px',
    background: 'transparent',
    border: 'none',
    borderRadius: 4,
    color: 'var(--text-muted)',
    fontSize: 13,
    cursor: 'pointer',
  },
  pillActive: {
    background: 'var(--surface-1)',
    color: 'var(--text-primary)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
  },
}
