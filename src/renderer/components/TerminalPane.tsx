import React from 'react'
import { useTerminal } from '../hooks/useTerminal'

interface TerminalPaneProps {
  sessionId: string | null
  scrollbackLines: number
  label?: string
  theme?: 'dark' | 'light'
  onClose?: () => void
}

export function TerminalPane({
  sessionId,
  scrollbackLines,
  label = 'Terminal',
  theme = 'dark',
  onClose,
}: TerminalPaneProps): React.JSX.Element {
  const { containerRef } = useTerminal({ sessionId, scrollbackLines, theme })

  return (
    <div style={paneStyles.wrapper}>
      <div style={paneStyles.header}>
        <span className="mono" style={paneStyles.headerText}>
          {label}
        </span>
        {onClose && (
          <button onClick={onClose} style={paneStyles.closeButton} title={`Close ${label}`}>
            ×
          </button>
        )}
      </div>
      <div ref={containerRef as React.RefCallback<HTMLDivElement> | React.RefObject<HTMLDivElement> | null} style={paneStyles.container} />
    </div>
  )
}

const paneStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
    justifyContent: 'space-between',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    borderRadius: '3px',
    color: 'var(--text-muted)',
    fontSize: '14px',
    lineHeight: 1,
    cursor: 'pointer',
  },
  headerText: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  container: {
    flex: 1,
    overflow: 'hidden',
    padding: '4px',
  },
}
