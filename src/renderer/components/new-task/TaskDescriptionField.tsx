import React from 'react'

// Mirrors the "Start a new project" textarea (NoProjectActions `textareaStyle`):
// the modest --radius-md keeps corners square enough for the targeting-reticle
// brackets to render — a pill radius would clip them away. No box: the
// `.reticle-input` resting brackets (theme.css) are the field's edge, dimmed
// while idle and brightening on focus. Border stays 1px-transparent so the
// focus reticle has a border-box to paint into without shifting layout.
const nameInputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 16px',
  minHeight: 48,
  fontSize: 15,
  lineHeight: '22px',
  fontFamily: 'inherit',
  background: 'transparent',
  border: '1px solid transparent',
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
        className="reticle-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={nameInputStyle}
        autoFocus
        placeholder="Agent name (optional), e.g. Dark mode toggle"
      />
    </div>
  )
}
