import React from 'react'
import { modalStyles } from '../NewTaskModal.styles'

export function TaskDescriptionField({
  value,
  onChange,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}): React.JSX.Element {
  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={modalStyles.input}
      autoFocus
      placeholder="Agent name, e.g. Dark mode toggle"
    />
  )
}
