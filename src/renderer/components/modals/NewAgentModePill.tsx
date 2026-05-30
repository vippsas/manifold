import React, { useState } from 'react'
import { modeToggleStyles, startButtonStyle } from './NewAgentForm.styles'

interface Props {
  mode: 'interactive' | 'chat'
  setMode: (m: 'interactive' | 'chat') => void
  canSubmit: boolean
  loading: boolean
}

const MODES = [
  { id: 'interactive', label: 'Interactive' },
  { id: 'chat', label: 'Chat' },
] as const

export function NewAgentModePill({ mode, setMode, canSubmit, loading }: Props): React.JSX.Element {
  const [hovered, setHovered] = useState<'interactive' | 'chat' | null>(null)

  return (
    <div style={modeToggleStyles.wrapper}>
      <div style={modeToggleStyles.track} role="tablist" aria-label="Agent mode">
        {MODES.map((m) => {
          const active = mode === m.id
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMode(m.id)}
              onMouseEnter={() => setHovered(m.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                ...modeToggleStyles.segment,
                ...(active ? modeToggleStyles.segmentActive : {}),
                ...(!active && hovered === m.id ? modeToggleStyles.segmentHover : {}),
              }}
            >
              {m.label}
            </button>
          )
        })}
      </div>
      <button type="submit" disabled={!canSubmit || loading} style={startButtonStyle(canSubmit, loading)}>
        {loading ? 'Starting…' : mode === 'chat' ? 'Start Chat' : 'Start Agent'}
      </button>
    </div>
  )
}
