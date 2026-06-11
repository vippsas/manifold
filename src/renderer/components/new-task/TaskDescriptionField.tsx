import React from 'react'

// Mirrors the "Start a new project" textarea (NoProjectActions `textareaStyle`):
// the modest --radius-md keeps corners square enough for the global focus rule's
// targeting-reticle brackets to render — a pill radius would clip them away.
const nameInputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 16px',
  minHeight: 48,
  fontSize: 15,
  lineHeight: '22px',
  fontFamily: 'inherit',
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
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
