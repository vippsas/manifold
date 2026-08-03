import React from 'react'

// One continuous edge, matching the runtime tiles and Start button below it:
// the border, background and accent focus ring all come from the global `input`
// rules in theme.css. Only the radius is restated, at --radius-md rather than
// the global --radius-sm, so the field rounds like the rest of the form.
const nameInputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 16px',
  minHeight: 48,
  fontSize: 15,
  lineHeight: '22px',
  fontFamily: 'inherit',
  borderRadius: 'var(--radius-md)',
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
