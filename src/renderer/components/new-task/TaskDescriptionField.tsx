import React from 'react'
import { modalStyles } from '../NewTaskModal.styles'

export function TaskDescriptionField({
  value,
  onChange,
  inputRef,
  canSubmit,
  loading,
}: {
  value: string
  onChange: (v: string) => void
  inputRef: React.Ref<HTMLInputElement>
  canSubmit: boolean
  loading: boolean
}): React.JSX.Element {
  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...modalStyles.input, width: '100%', paddingRight: 100, boxSizing: 'border-box' }}
        autoFocus
        placeholder="Agent name, e.g. Dark mode toggle"
      />
      <button
        type="submit"
        disabled={!canSubmit || loading}
        style={{
          position: 'absolute',
          right: 4,
          top: '50%',
          transform: 'translateY(-50%)',
          padding: '5px 14px',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--accent-text)',
          backgroundColor: 'var(--accent)',
          border: 'none',
          borderRadius: 4,
          cursor: canSubmit && !loading ? 'pointer' : 'default',
          opacity: canSubmit && !loading ? 1 : 0.5,
        }}
      >
        {loading ? 'Starting…' : 'Start →'}
      </button>
    </div>
  )
}
