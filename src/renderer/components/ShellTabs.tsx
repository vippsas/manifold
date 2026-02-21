import React, { useState, useRef, useCallback } from 'react'
import type { ITheme } from '@xterm/xterm'
import { useTerminal } from '../hooks/useTerminal'
import { shellTabStyles as styles } from './ShellTabs.styles'
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
  xtermTheme?: ITheme
  onClose?: () => void
}

function ExtraShellTerminal({
  sessionId, scrollbackLines, xtermTheme, isActive,
}: {
  sessionId: string; scrollbackLines: number; xtermTheme?: ITheme; isActive: boolean
}): React.JSX.Element {
  const { containerRef } = useTerminal({ sessionId, scrollbackLines, xtermTheme })
  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      style={{ ...styles.terminalContainer, display: isActive ? 'block' : 'none' }}
    />
  )
}

export function ShellTabs({
  worktreeSessionId, projectSessionId, worktreeCwd,
  scrollbackLines, xtermTheme, onClose,
}: ShellTabsProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<string>(worktreeSessionId ? 'worktree' : 'project')
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

  const worktreeTerminal = useTerminal({ sessionId: worktreeSessionId, scrollbackLines, xtermTheme })
  const projectTerminal = useTerminal({ sessionId: projectSessionId, scrollbackLines, xtermTheme })

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

  return (
    <div style={styles.wrapper}>
      <ShellTabBar
        effectiveTab={effectiveTab} worktreeSessionId={worktreeSessionId}
        extraShells={extraShells} onSetActiveTab={setActiveTab}
        onRemoveShell={removeShell} onAddShell={() => void addShell()} onClose={onClose}
      />
      <div style={styles.terminalArea}>
        <div
          ref={worktreeTerminal.containerRef as React.RefObject<HTMLDivElement>}
          style={{ ...styles.terminalContainer, display: effectiveTab === 'worktree' ? 'block' : 'none' }}
        />
        <div
          ref={projectTerminal.containerRef as React.RefObject<HTMLDivElement>}
          style={{ ...styles.terminalContainer, display: effectiveTab === 'project' ? 'block' : 'none' }}
        />
        {extraShells.map((shell) => (
          <ExtraShellTerminal
            key={shell.sessionId} sessionId={shell.sessionId}
            scrollbackLines={scrollbackLines} xtermTheme={xtermTheme}
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

function ShellTabBar({
  effectiveTab, worktreeSessionId, extraShells,
  onSetActiveTab, onRemoveShell, onAddShell, onClose,
}: {
  effectiveTab: string; worktreeSessionId: string | null; extraShells: ExtraShell[]
  onSetActiveTab: (tab: string) => void; onRemoveShell: (id: string) => void
  onAddShell: () => void; onClose?: () => void
}): React.JSX.Element {
  return (
    <div style={styles.tabBar}>
      <button
        style={{
          ...styles.tab,
          ...(effectiveTab === 'worktree' ? styles.tabActive : {}),
          ...(!worktreeSessionId ? styles.tabDisabled : {}),
        }}
        onClick={() => worktreeSessionId && onSetActiveTab('worktree')}
        disabled={!worktreeSessionId}
      >
        Worktree
      </button>
      <button
        style={{ ...styles.tab, ...(effectiveTab === 'project' ? styles.tabActive : {}) }}
        onClick={() => onSetActiveTab('project')}
      >
        Project
      </button>
      {extraShells.map((shell) => {
        const tabId = `extra-${shell.sessionId}`
        return (
          <button
            key={shell.sessionId}
            style={{ ...styles.tab, ...(effectiveTab === tabId ? styles.tabActive : {}) }}
            onClick={() => onSetActiveTab(tabId)}
          >
            <span>{shell.label}</span>
            <span
              role="button" style={styles.tabCloseButton}
              onClick={(e) => { e.stopPropagation(); onRemoveShell(shell.sessionId) }}
              title={`Close ${shell.label}`}
            >
              x
            </span>
          </button>
        )
      })}
      {worktreeSessionId && (
        <button style={styles.addTabButton} onClick={onAddShell} title="New shell tab">+</button>
      )}
      {onClose && (
        <>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={styles.closeButton} title="Close Shell">x</button>
        </>
      )}
    </div>
  )
}
