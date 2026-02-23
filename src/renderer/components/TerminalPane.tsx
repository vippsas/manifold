import React from 'react'
import type { ITheme } from '@xterm/xterm'
import { useTerminal } from '../hooks/useTerminal'

interface TerminalPaneProps {
  sessionId: string | null
  scrollbackLines: number
  terminalFontFamily?: string
  label?: string
  xtermTheme?: ITheme
}

export function TerminalPane({
  sessionId,
  scrollbackLines,
  terminalFontFamily,
  label = 'Terminal',
  xtermTheme,
}: TerminalPaneProps): React.JSX.Element {
  const { containerRef } = useTerminal({ sessionId, scrollbackLines, terminalFontFamily, xtermTheme })

  return (
    <div style={paneStyles.wrapper}>
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
  container: {
    flex: 1,
    overflow: 'hidden',
    padding: '4px',
  },
}
