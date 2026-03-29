import React from 'react'
import { modalStyles } from '../modals/NewTaskModal.styles'

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
        style={{ ...modalStyles.input, width: '100%', boxSizing: 'border-box' }}
        autoFocus
        placeholder="Agent name (optional), e.g. Dark mode toggle"
      />
    </div>
  )
}
