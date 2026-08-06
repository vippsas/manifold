import React, { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { ITheme } from '@xterm/xterm'
import { useTerminal } from '../../hooks/terminal/useTerminal'
import { ShellTabControls } from './ShellTabControls'
import { shellTabStyles as styles } from './ShellTabs.styles'
import { registerShellHeaderControls, unregisterShellHeaderControls } from './shell-header-controls'
import {
  addTerminal, closeTerminal, dismissScopeError, getScope, openScope,
  setActiveTerminal, subscribeShellTerminals, type ShellMode,
} from './shell-terminal-store'

interface ShellTabsProps {
  cwd: string | null
  scrollbackLines: number
  terminalFontFamily?: string
  xtermTheme?: ITheme
}

function ShellTerminalView({
  sessionId, scrollbackLines, terminalFontFamily, xtermTheme, isActive,
}: {
  sessionId: string; scrollbackLines: number; terminalFontFamily?: string
  xtermTheme?: ITheme; isActive: boolean
}): React.JSX.Element {
  const { containerRef } = useTerminal({ sessionId, scrollbackLines, terminalFontFamily, xtermTheme })
  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className="terminal-host"
      style={{ ...styles.terminalContainer, display: isActive ? 'block' : 'none' }}
    />
  )
}

export function ShellTabs({
  cwd, scrollbackLines, terminalFontFamily, xtermTheme,
}: ShellTabsProps): React.JSX.Element {
  // No local error state: the panel unmounts on close, so anything held here
  // would either vanish or come back from the dead on reopen. The store owns
  // both the message and its dismissal, scoped to the cwd that produced it.
  const scope = useSyncExternalStore(subscribeShellTerminals, () => getScope(cwd))

  useEffect(() => {
    if (!cwd) return
    void openScope(cwd)
  }, [cwd])

  const addShell = useCallback((mode: ShellMode) => {
    if (cwd) void addTerminal(cwd, mode)
  }, [cwd])

  const closeShell = useCallback((sessionId: string) => {
    if (cwd) closeTerminal(cwd, sessionId)
  }, [cwd])

  const selectShell = useCallback((sessionId: string) => {
    if (cwd) setActiveTerminal(cwd, sessionId)
  }, [cwd])

  const headerControls = React.useMemo(() => ({
    canAddShell: Boolean(cwd),
    activeSessionId: scope.activeSessionId,
    onCloseTerminal: closeShell,
    onAddShell: addShell,
  }), [cwd, scope.activeSessionId, closeShell, addShell])

  useEffect(() => {
    registerShellHeaderControls(headerControls)
    return () => unregisterShellHeaderControls(headerControls)
  }, [headerControls])

  return (
    <div style={styles.wrapper}>
      {scope.error && cwd && (
        <div style={styles.errorStrip} role="alert">
          {scope.error}
          <button type="button" style={styles.errorDismiss} onClick={() => dismissScopeError(cwd)}>×</button>
        </div>
      )}
      <div style={styles.body}>
        <div style={styles.terminalArea}>
          {scope.terminals.length === 0 && (
            <div style={styles.emptyState}>
              {cwd
                ? <button type="button" onClick={() => addShell('manifold')}>New Terminal</button>
                : 'Select a workspace to open a terminal'}
            </div>
          )}
          {scope.terminals.map((terminal) => (
            <ShellTerminalView
              key={terminal.sessionId}
              sessionId={terminal.sessionId}
              scrollbackLines={scrollbackLines}
              terminalFontFamily={terminalFontFamily}
              xtermTheme={xtermTheme}
              isActive={scope.activeSessionId === terminal.sessionId}
            />
          ))}
        </div>
        {scope.terminals.length > 1 && (
          <ShellTabControls
            terminals={scope.terminals}
            activeSessionId={scope.activeSessionId}
            onSetActiveTerminal={selectShell}
            onCloseTerminal={closeShell}
          />
        )}
      </div>
    </div>
  )
}
