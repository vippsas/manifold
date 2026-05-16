import React, { useState, useRef, useCallback, useEffect } from 'react'
import type { ITheme } from '@xterm/xterm'
import { useTerminal } from '../../hooks/useTerminal'
import { shellTabStyles as styles } from './ShellTabs.styles'
import { registerShellHeaderControls, unregisterShellHeaderControls } from './shell-header-controls'
import {
  useSyncCacheOnAgentChange, useKeepCacheInSync, usePersistTabs,
  useRestoreTabsFromDisk, usePersistOnChange, useCleanupOnUnmount,
} from './shell-tabs-hooks'
import type { ExtraShell } from './shell-tabs-hooks'

interface ShellTabsProps {
  worktreeSessionId: string | null
  projectSessionId: string | null
  worktreeCwd: string | null
  scrollbackLines: number
  terminalFontFamily?: string
  xtermTheme?: ITheme
}

function ExtraShellTerminal({
  sessionId, scrollbackLines, terminalFontFamily, xtermTheme, isActive,
}: {
  sessionId: string; scrollbackLines: number; terminalFontFamily?: string; xtermTheme?: ITheme; isActive: boolean
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
  worktreeSessionId, projectSessionId, worktreeCwd,
  scrollbackLines, terminalFontFamily, xtermTheme,
}: ShellTabsProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<string>(worktreeSessionId ? 'worktree' : 'project')

  useEffect(() => {
    if (worktreeSessionId) setActiveTab('worktree')
  }, [worktreeSessionId])

  const extraShellCacheRef = useRef(new Map<string, { shells: ExtraShell[]; counter: number }>())
  const agentKey = worktreeSessionId ?? '__none__'
  const persistKey = worktreeCwd ?? '__none__'

  if (!extraShellCacheRef.current.has(agentKey)) {
    extraShellCacheRef.current.set(agentKey, { shells: [], counter: 3 })
  }

  const [extraShells, setExtraShells] = useState<ExtraShell[]>(
    extraShellCacheRef.current.get(agentKey)!.shells
  )

  useSyncCacheOnAgentChange(agentKey, extraShellCacheRef, setExtraShells)
  useKeepCacheInSync(extraShells, agentKey, extraShellCacheRef)

  const persistTabs = usePersistTabs(persistKey, worktreeCwd)
  const restoredRef = useRef(new Set<string>())

  useRestoreTabsFromDisk(worktreeCwd, persistKey, agentKey, extraShellCacheRef, restoredRef, setExtraShells)
  usePersistOnChange(extraShells, agentKey, persistKey, restoredRef, extraShellCacheRef, persistTabs)

  const worktreeTerminal = useTerminal({ sessionId: worktreeSessionId, scrollbackLines, terminalFontFamily, xtermTheme })
  const projectTerminal = useTerminal({ sessionId: projectSessionId, scrollbackLines, terminalFontFamily, xtermTheme })

  useCleanupOnUnmount(extraShellCacheRef)

  const effectiveTab = resolveEffectiveTab(activeTab, worktreeSessionId, extraShells)

  const addShell = useCallback(async () => {
    if (!worktreeCwd) return
    try {
      const result = (await window.electronAPI.invoke('shell:create', worktreeCwd)) as { sessionId: string }
      const entry = extraShellCacheRef.current.get(agentKey)
      const counter = entry ? entry.counter++ : 3
      setExtraShells((prev) => [...prev, { sessionId: result.sessionId, label: `Shell ${counter}` }])
      setActiveTab(`extra-${result.sessionId}`)
    } catch {
      // shell:create failed -- ignore silently, user can retry
    }
  }, [worktreeCwd, agentKey])

  const removeShell = useCallback(
    (sessionId: string) => {
      void window.electronAPI.invoke('shell:kill', sessionId).catch(() => {})
      setExtraShells((prev) => prev.filter((s) => s.sessionId !== sessionId))
      setActiveTab((prev) => {
        if (prev === `extra-${sessionId}`) return worktreeSessionId ? 'worktree' : 'project'
        return prev
      })
    },
    [worktreeSessionId]
  )

  const addShellFromHeader = useCallback(() => {
    void addShell()
  }, [addShell])

  const headerControls = React.useMemo(() => ({
    effectiveTab,
    worktreeSessionId,
    extraShells,
    onSetActiveTab: setActiveTab,
    onRemoveShell: removeShell,
    onAddShell: addShellFromHeader,
  }), [effectiveTab, worktreeSessionId, extraShells, removeShell, addShellFromHeader])

  useEffect(() => {
    registerShellHeaderControls(headerControls)
    return () => unregisterShellHeaderControls(headerControls)
  }, [headerControls])

  return (
    <div style={styles.wrapper}>
      <div style={styles.terminalArea}>
        <div
          ref={worktreeTerminal.containerRef as React.RefObject<HTMLDivElement>}
          className="terminal-host"
          style={{ ...styles.terminalContainer, display: effectiveTab === 'worktree' ? 'block' : 'none' }}
        />
        <div
          ref={projectTerminal.containerRef as React.RefObject<HTMLDivElement>}
          className="terminal-host"
          style={{ ...styles.terminalContainer, display: effectiveTab === 'project' ? 'block' : 'none' }}
        />
        {extraShells.map((shell) => (
          <ExtraShellTerminal
            key={shell.sessionId} sessionId={shell.sessionId}
            scrollbackLines={scrollbackLines} terminalFontFamily={terminalFontFamily}
            xtermTheme={xtermTheme}
            isActive={effectiveTab === `extra-${shell.sessionId}`}
          />
        ))}
      </div>
    </div>
  )
}

function resolveEffectiveTab(activeTab: string, worktreeSessionId: string | null, extraShells: ExtraShell[]): string {
  let tab = activeTab
  if (!worktreeSessionId && tab === 'worktree') tab = 'project'
  if (tab.startsWith('extra-')) {
    const shellId = tab.slice(6)
    if (!extraShells.find((s) => s.sessionId === shellId)) {
      tab = worktreeSessionId ? 'worktree' : 'project'
    }
  }
  return tab
}
