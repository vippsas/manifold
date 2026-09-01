import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { ITheme } from '@xterm/xterm'
import { useTerminal } from '../../hooks/terminal/useTerminal'
import { ShellTabControls } from './ShellTabControls'
import { shellTabStyles as styles } from './ShellTabs.styles'
import { registerShellHeaderControls, unregisterShellHeaderControls } from './shell-header-controls'
import { ShellFolderMenu } from './ShellFolderMenu'
import type { ShellFolder } from './shell-cwd'
import {
  addTerminal, closeTerminal, dismissScopeError, getScope, openScope,
  setActiveTerminal, subscribeShellTerminals, type ShellMode,
} from './shell-terminal-store'

interface ShellTabsProps {
  cwd: string | null
  /** Every folder of the workspace a new terminal may run in, primary first.
   *  `cwd` is the first of these; the rest are what the folder picker offers. */
  folders: ShellFolder[]
  scrollbackLines: number
  terminalFontFamily?: string
  xtermTheme?: ITheme
  /** Hide the whole terminal view (the shell dock panel). The terminals stay
   *  alive in the store, so reopening the panel shows them again. */
  onHide?: () => void
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
  cwd, folders, scrollbackLines, terminalFontFamily, xtermTheme, onHide,
}: ShellTabsProps): React.JSX.Element {
  // No local error state: the panel unmounts on close, so anything held here
  // would either vanish or come back from the dead on reopen. The store owns
  // both the message and its dismissal, scoped to the cwd that produced it.
  const scope = useSyncExternalStore(subscribeShellTerminals, () => getScope(cwd))

  useEffect(() => {
    if (!cwd) return
    void openScope(cwd)
  }, [cwd])

  // Anchor for the empty state's folder picker; null while it is closed.
  const [emptyPickerAnchor, setEmptyPickerAnchor] = useState<{ top: number; left: number } | null>(null)

  const addShell = useCallback((mode: ShellMode, folderCwd?: string) => {
    if (cwd) void addTerminal(cwd, mode, folderCwd)
  }, [cwd])

  // The empty state's own button asks the same question the header's + does, so
  // the two entry points cannot disagree about which folder a terminal opens in.
  const requestAddShellFromEmptyState = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (folders.length > 1) {
      const rect = event.currentTarget.getBoundingClientRect()
      setEmptyPickerAnchor({ top: rect.bottom + 4, left: rect.left })
      return
    }
    addShell('manifold', folders[0]?.path)
  }, [addShell, folders])

  const closeShell = useCallback((sessionId: string) => {
    if (cwd) closeTerminal(cwd, sessionId)
  }, [cwd])

  const selectShell = useCallback((sessionId: string) => {
    if (cwd) setActiveTerminal(cwd, sessionId)
  }, [cwd])

  const hideTerminals = useCallback(() => { onHide?.() }, [onHide])

  const headerControls = React.useMemo(() => ({
    canAddShell: Boolean(cwd),
    folders,
    onAddShell: addShell,
    onHideTerminals: hideTerminals,
  }), [cwd, folders, addShell, hideTerminals])

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
                ? <button type="button" onClick={requestAddShellFromEmptyState}>New Terminal</button>
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
        {scope.terminals.length > 0 && (
          <ShellTabControls
            terminals={scope.terminals}
            folders={folders}
            activeSessionId={scope.activeSessionId}
            onSetActiveTerminal={selectShell}
            onCloseTerminal={closeShell}
          />
        )}
      </div>
      {emptyPickerAnchor && (
        <ShellFolderMenu
          folders={folders}
          anchor={emptyPickerAnchor}
          onPick={(folder) => {
            setEmptyPickerAnchor(null)
            addShell('manifold', folder.path)
          }}
          onClose={() => setEmptyPickerAnchor(null)}
        />
      )}
    </div>
  )
}
