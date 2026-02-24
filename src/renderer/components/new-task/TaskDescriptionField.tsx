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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={modalStyles.label}>
        Task name
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={modalStyles.input}
          placeholder="e.g. Dark mode toggle"
        />
      </label>
      <p style={modalStyles.hint}>
        A short name to identify this task
      </p>
    </div>
  )
}
