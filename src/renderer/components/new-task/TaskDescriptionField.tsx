import React from 'react'
import { modalStyles } from '../NewTaskModal.styles'

export function TaskDescriptionField({
  value,
  onChange,
  textareaRef,
}: {
  value: string
  onChange: (v: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={modalStyles.label}>
        What do you want to work on?
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={modalStyles.textarea}
          rows={3}
        />
      </label>
      <p style={modalStyles.hint}>
        Describe what you want the agent to work on — used for branch naming and tracking
      </p>
    </div>
  )
}
