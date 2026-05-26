import React, { useCallback } from 'react'
import type { ITheme } from '@xterm/xterm'
import { TerminalPane } from '../terminal/TerminalPane'
import { ApprovalInbox } from '../superagent/ApprovalInbox'
import { useApprovalInbox } from '../../hooks/useApprovalInbox'
import { useDockState } from './dock-panel-types'

interface SuperagentTerminalViewProps {
  superagentId: string
  scrollbackLines: number
  terminalFontFamily?: string
  xtermTheme?: ITheme
  isDormant: boolean
  onRestart?: () => void
}

// Memoized so unrelated dock-state churn (file clicks, expanded paths, etc.)
// doesn't reconcile the xterm subtree on every render of the outer panel.
const SuperagentTerminalView = React.memo(function SuperagentTerminalView({
  superagentId,
  scrollbackLines,
  terminalFontFamily,
  xtermTheme,
  isDormant,
  onRestart,
}: SuperagentTerminalViewProps): React.JSX.Element {
  return (
    <div style={terminalWrapperStyle}>
      <TerminalPane
        sessionId={superagentId}
        scrollbackLines={scrollbackLines}
        terminalFontFamily={terminalFontFamily}
        label="Superagent"
        xtermTheme={xtermTheme}
      />
      {isDormant && onRestart && (
        <div style={restartOverlayStyles.container}>
          <button onClick={onRestart} style={restartOverlayStyles.button}>
            Restart Superagent
          </button>
        </div>
      )}
    </div>
  )
})

const terminalWrapperStyle: React.CSSProperties = { flex: 1, minHeight: 0, position: 'relative' }

export function SuperagentAgentPanel(): React.JSX.Element | null {
  const s = useDockState()
  const superagentId = s.activeSuperagentId
  const onResume = s.onResumeSuperagent
  const handleRestart = useCallback(() => {
    if (superagentId && onResume) {
      void onResume(superagentId)
    }
  }, [superagentId, onResume])
  // Hooks must run unconditionally; useApprovalInbox returns an empty pending
  // list when given a non-matching id, which is fine for the null case below.
  const { pending, respond } = useApprovalInbox(superagentId ?? '')
  if (!superagentId) return null
  const activeSuperagent = s.superagents?.find((sa) => sa.id === superagentId)
  const isDormant = activeSuperagent?.status === 'done' || activeSuperagent?.status === 'error'
  const onToggleAutoApprove = s.onToggleSuperagentAutoApprove
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {activeSuperagent && onToggleAutoApprove && (
        <div style={approvalBarStyles.container}>
          <label style={approvalBarStyles.label}>
            <input
              type="checkbox"
              checked={activeSuperagent.autoApprove}
              onChange={(e) => { void onToggleAutoApprove(superagentId, e.currentTarget.checked) }}
            />
            <span>Auto-approve superagent tool calls</span>
          </label>
          <span style={approvalBarStyles.hint}>
            When off, `spawn_agent`, `send_prompt`, and `stop_agent` wait here for approval and can time out after 120s.
          </span>
        </div>
      )}
      {pending.length > 0 && (
        <div style={pendingBannerStyles.container}>
          <div style={pendingBannerStyles.copy}>
            <div style={pendingBannerStyles.title}>
              {pending.length} approval{pending.length === 1 ? '' : 's'} waiting
            </div>
            <div style={pendingBannerStyles.body}>
              This superagent is blocked until you approve or deny the pending tool calls.
            </div>
          </div>
          <div style={pendingBannerStyles.actions}>
            <button
              type="button"
              onClick={() => { void respond(pending[0].requestId, 'approve-all') }}
              style={pendingBannerStyles.primaryButton}
            >
              Approve all
            </button>
            <span style={pendingBannerStyles.meta}>Detailed approvals remain in the inbox below.</span>
          </div>
        </div>
      )}
      <SuperagentTerminalView
        superagentId={superagentId}
        scrollbackLines={s.scrollbackLines}
        terminalFontFamily={s.terminalFontFamily}
        xtermTheme={s.xtermTheme}
        isDormant={isDormant}
        onRestart={onResume ? handleRestart : undefined}
      />
      <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
        <ApprovalInbox superagentId={superagentId} pending={pending} respond={respond} />
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

const approvalBarStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
  },
  hint: {
    fontSize: 11,
    color: 'var(--text-muted)',
    textAlign: 'right',
  },
}

const pendingBannerStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-md)',
    padding: 'var(--space-sm) var(--space-md)',
    borderBottom: '1px solid var(--border)',
    background: 'linear-gradient(135deg, var(--warning-subtle), color-mix(in srgb, var(--warning-subtle), var(--bg-secondary) 30%))',
    boxShadow: 'var(--shadow-subtle)',
  },
  copy: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  title: {
    fontSize: 'var(--type-ui-small)',
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: 'var(--tracking-wide)',
    textTransform: 'uppercase',
  },
  body: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-secondary)',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    flexShrink: 0,
  },
  primaryButton: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
    color: 'var(--accent-text)',
    padding: '6px 12px',
    fontSize: 'var(--type-ui-small)',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: 'var(--shadow-subtle)',
  },
  meta: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
  },
}
