import React from 'react'

// Mirrors the non-interactive chat composer's input (ChatPane.styles.ts `input`):
// tall, pill-rounded, sans-serif, 15px — so the agent name field matches it.
const nameInputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 16px',
  minHeight: 48,
  fontSize: 15,
  lineHeight: '22px',
  fontFamily: 'inherit',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 20,
  color: 'var(--text-primary)',
  outline: 'none',
}

export function TaskDescriptionField({
  value,
  onChange,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  inputRef: React.Ref<HTMLInputElement>
  canSubmit?: boolean
  loading?: boolean
}): React.JSX.Element {
  return (
    <div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={nameInputStyle}
        autoFocus
        placeholder="Agent name (optional), e.g. Dark mode toggle"
      />
    </div>
  )
}
