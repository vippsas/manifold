import React from 'react'
import { useTerminal } from '../hooks/useTerminal'

interface TerminalPaneProps {
  sessionId: string | null
  scrollbackLines: number
}

export function TerminalPane({
  sessionId,
  scrollbackLines,
}: TerminalPaneProps): React.JSX.Element {
  const { containerRef } = useTerminal({ sessionId, scrollbackLines })

  return (
    <div style={paneStyles.wrapper}>
      <div style={paneStyles.header}>
        <span className="mono" style={paneStyles.headerText}>
          Terminal
        </span>
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
