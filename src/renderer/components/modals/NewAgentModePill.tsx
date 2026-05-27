import React from 'react'
import { modePillStyles, startButtonStyle } from './NewAgentForm.styles'

interface Props {
  mode: 'interactive' | 'chat'
  setMode: (m: 'interactive' | 'chat') => void
  canSubmit: boolean
  loading: boolean
}

export function NewAgentModePill({ mode, setMode, canSubmit, loading }: Props): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'var(--space-sm)' }}>
      <div style={modePillStyles.container}>
        <button
          type="button"
          onClick={() => setMode('interactive')}
          style={{ ...modePillStyles.button, ...(mode === 'interactive' ? modePillStyles.buttonActive : {}) }}
        >
          Interactive
        </button>
        <span style={modePillStyles.separator} aria-hidden="true">·</span>
        <button
          type="button"
          onClick={() => setMode('chat')}
          style={{ ...modePillStyles.button, ...(mode === 'chat' ? modePillStyles.buttonActive : {}) }}
        >
          Chat
        </button>
      </div>
      <button type="submit" disabled={!canSubmit || loading} style={startButtonStyle(canSubmit, loading)}>
        {loading ? 'Starting…' : mode === 'chat' ? 'Start Chat' : 'Start Agent'}
      </button>
    </div>
  )
}
