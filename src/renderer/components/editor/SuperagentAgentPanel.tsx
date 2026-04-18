import React from 'react'
import { TerminalPane } from '../terminal/TerminalPane'
import { ApprovalInbox } from '../superagent/ApprovalInbox'
import { useDockState } from './dock-panel-types'

export function SuperagentAgentPanel(): React.JSX.Element | null {
  const s = useDockState()
  if (!s.activeSuperagentId) return null
  const activeSuperagent = s.superagents?.find((sa) => sa.id === s.activeSuperagentId)
  const isDormant = activeSuperagent?.status === 'done' || activeSuperagent?.status === 'error'
  const superagentId = s.activeSuperagentId
  const onResume = s.onResumeSuperagent
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <TerminalPane
          sessionId={superagentId}
          scrollbackLines={s.scrollbackLines}
          terminalFontFamily={s.terminalFontFamily}
          label="Superagent"
          xtermTheme={s.xtermTheme}
        />
        {isDormant && onResume && (
          <div style={restartOverlayStyles.container}>
            <button
              onClick={() => { void onResume(superagentId) }}
              style={restartOverlayStyles.button}
            >
              Restart Superagent
            </button>
          </div>
        )}
      </div>
      <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <ApprovalInbox superagentId={superagentId} />
      </div>
    </div>
  )
}

export const restartOverlayStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    display: 'flex',
    justifyContent: 'center',
    padding: '12px',
    background: 'linear-gradient(transparent, var(--bg-primary) 40%)',
    pointerEvents: 'none',
  },
  button: {
    pointerEvents: 'auto',
    padding: '6px 20px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--bg-primary)',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
}
