import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { ITheme } from '@xterm/xterm'
import { useTerminal } from '../hooks/useTerminal'

interface ExtraShell {
  sessionId: string
  label: string
}

interface ShellTabsProps {
  worktreeSessionId: string | null
  projectSessionId: string | null
  worktreeCwd: string | null
  scrollbackLines: number
  xtermTheme?: ITheme
  onClose?: () => void
}

function ExtraShellTerminal({
  sessionId,
  scrollbackLines,
  xtermTheme,
  isActive,
}: {
  sessionId: string
  scrollbackLines: number
  xtermTheme?: ITheme
  isActive: boolean
}): React.JSX.Element {
  const { containerRef } = useTerminal({ sessionId, scrollbackLines, xtermTheme })
  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      style={{
        ...styles.terminalContainer,
        display: isActive ? 'block' : 'none',
      }}
    />
  )
}

export function ShellTabs({
  worktreeSessionId,
  projectSessionId,
  worktreeCwd,
  scrollbackLines,
  xtermTheme,
  onClose,
}: ShellTabsProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<string>(
    worktreeSessionId ? 'worktree' : 'project'
  )
  // Cache extra shells per agent so they survive agent switches
  const extraShellCacheRef = useRef(new Map<string, { shells: ExtraShell[]; counter: number }>())
  const agentKey = worktreeSessionId ?? '__none__'
  // Use worktree path as persistence key (stable across restarts, unlike session IDs)
  const persistKey = worktreeCwd ?? '__none__'

  // Get or initialize cache entry for current agent
  if (!extraShellCacheRef.current.has(agentKey)) {
    extraShellCacheRef.current.set(agentKey, { shells: [], counter: 3 })
  }
  const cached = extraShellCacheRef.current.get(agentKey)!

  const [extraShells, setExtraShells] = useState<ExtraShell[]>(cached.shells)

  // Sync state when agent changes — restore cached shells
  useEffect(() => {
    const entry = extraShellCacheRef.current.get(agentKey)
    setExtraShells(entry?.shells ?? [])
  }, [agentKey])

  // Keep cache in sync with state changes
  useEffect(() => {
    const entry = extraShellCacheRef.current.get(agentKey)
    if (entry) {
      entry.shells = extraShells
    }
  }, [extraShells, agentKey])

  // Persist tabs to disk so they survive app restart
  const persistTabs = useCallback(
    (shells: ExtraShell[], counter: number) => {
      if (!worktreeCwd) return
      if (shells.length === 0) {
        void window.electronAPI.invoke('shell-tabs:set', persistKey, { tabs: [], counter })
      } else {
        const tabs = shells.map((s) => ({ label: s.label, cwd: worktreeCwd }))
        void window.electronAPI.invoke('shell-tabs:set', persistKey, { tabs, counter })
      }
    },
    [persistKey, worktreeCwd]
  )

  // Track which agents have been restored to avoid duplicate restores
  // and to guard persist effect from firing before restore completes
  const restoredRef = useRef(new Set<string>())

  // Restore saved tabs from disk on agent switch
  useEffect(() => {
    if (!worktreeCwd || persistKey === '__none__') return
    if (restoredRef.current.has(persistKey)) return
    // If cache already has shells for this agent, skip restore (already in memory)
    const entry = extraShellCacheRef.current.get(agentKey)
    if (entry && entry.shells.length > 0) return

    restoredRef.current.add(persistKey)

    void (async () => {
      const saved = (await window.electronAPI.invoke('shell-tabs:get', persistKey)) as {
        tabs: { label: string; cwd: string }[]
        counter: number
      } | null
      if (!saved || saved.tabs.length === 0) return

      const shells: ExtraShell[] = []
      for (const tab of saved.tabs) {
        try {
          const result = (await window.electronAPI.invoke('shell:create', tab.cwd)) as {
            sessionId: string
          }
          shells.push({ sessionId: result.sessionId, label: tab.label })
        } catch {
          // skip failed shell creation
        }
      }

      if (shells.length > 0) {
        const cacheEntry = extraShellCacheRef.current.get(agentKey) ?? { shells: [], counter: 3 }
        cacheEntry.shells = shells
        cacheEntry.counter = saved.counter
        extraShellCacheRef.current.set(agentKey, cacheEntry)
        setExtraShells(shells)
      }
    })()
  }, [agentKey, persistKey, worktreeCwd])

  // Persist tabs to disk whenever extraShells changes
  useEffect(() => {
    // Don't persist until restore has had a chance to run
    if (!restoredRef.current.has(persistKey)) return
    const entry = extraShellCacheRef.current.get(agentKey)
    if (!entry) return
    persistTabs(extraShells, entry.counter)
  }, [extraShells, agentKey, persistTabs])

  const worktreeTerminal = useTerminal({ sessionId: worktreeSessionId, scrollbackLines, xtermTheme })
  const projectTerminal = useTerminal({ sessionId: projectSessionId, scrollbackLines, xtermTheme })

  // Kill all cached extra shells on unmount only
  useEffect(() => {
    const cache = extraShellCacheRef.current
    return () => {
      for (const entry of cache.values()) {
        for (const shell of entry.shells) {
          void window.electronAPI.invoke('shell:kill', shell.sessionId).catch(() => {})
        }
      }
      cache.clear()
    }
  }, [])

  // Compute which tab is actually shown
  let effectiveTab = activeTab
  if (!worktreeSessionId && effectiveTab === 'worktree') {
    effectiveTab = 'project'
  }
  if (effectiveTab.startsWith('extra-')) {
    const shellId = effectiveTab.slice(6)
    if (!extraShells.find((s) => s.sessionId === shellId)) {
      effectiveTab = worktreeSessionId ? 'worktree' : 'project'
    }
  }

  const addShell = useCallback(async () => {
    if (!worktreeCwd) return
    try {
      const result = (await window.electronAPI.invoke('shell:create', worktreeCwd)) as {
        sessionId: string
      }
      const entry = extraShellCacheRef.current.get(agentKey)
      const counter = entry ? entry.counter++ : 3
      const label = `Shell ${counter}`
      setExtraShells((prev) => [...prev, { sessionId: result.sessionId, label }])
      setActiveTab(`extra-${result.sessionId}`)
    } catch {
      // shell:create failed — ignore silently, user can retry
    }
  }, [worktreeCwd, agentKey])

  const removeShell = useCallback(
    (sessionId: string) => {
      void window.electronAPI.invoke('shell:kill', sessionId).catch(() => {})
      setExtraShells((prev) => prev.filter((s) => s.sessionId !== sessionId))
      setActiveTab((prev) => {
        if (prev === `extra-${sessionId}`) {
          return worktreeSessionId ? 'worktree' : 'project'
        }
        return prev
      })
    },
    [worktreeSessionId, agentKey]
  )

  return (
    <div style={styles.wrapper}>
      <div style={styles.tabBar}>
        <button
          style={{
            ...styles.tab,
            ...(effectiveTab === 'worktree' ? styles.tabActive : {}),
            ...(!worktreeSessionId ? styles.tabDisabled : {}),
          }}
          onClick={() => worktreeSessionId && setActiveTab('worktree')}
          disabled={!worktreeSessionId}
        >
          Worktree
        </button>
        <button
          style={{
            ...styles.tab,
            ...(effectiveTab === 'project' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('project')}
        >
          Project
        </button>

        {extraShells.map((shell) => {
          const tabId = `extra-${shell.sessionId}`
          const isActive = effectiveTab === tabId
          return (
            <button
              key={shell.sessionId}
              style={{
                ...styles.tab,
                ...(isActive ? styles.tabActive : {}),
              }}
              onClick={() => setActiveTab(tabId)}
            >
              <span>{shell.label}</span>
              <span
                role="button"
                style={styles.tabCloseButton}
                onClick={(e) => {
                  e.stopPropagation()
                  removeShell(shell.sessionId)
                }}
                title={`Close ${shell.label}`}
              >
                ×
              </span>
            </button>
          )
        })}

        {worktreeSessionId && (
          <button
            style={styles.addTabButton}
            onClick={() => void addShell()}
            title="New shell tab"
          >
            +
          </button>
        )}

        {onClose && (
          <>
            <span style={{ flex: 1 }} />
            <button onClick={onClose} style={styles.closeButton} title="Close Shell">
              ×
            </button>
          </>
        )}
      </div>
      <div style={styles.terminalArea}>
        <div
          ref={worktreeTerminal.containerRef as React.RefObject<HTMLDivElement>}
          style={{
            ...styles.terminalContainer,
            display: effectiveTab === 'worktree' ? 'block' : 'none',
          }}
        />
        <div
          ref={projectTerminal.containerRef as React.RefObject<HTMLDivElement>}
          style={{
            ...styles.terminalContainer,
            display: effectiveTab === 'project' ? 'block' : 'none',
          }}
        />
        {extraShells.map((shell) => (
          <ExtraShellTerminal
            key={shell.sessionId}
            sessionId={shell.sessionId}
            scrollbackLines={scrollbackLines}
            xtermTheme={xtermTheme}
            isActive={effectiveTab === `extra-${shell.sessionId}`}
          />
        ))}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
    gap: 0,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px',
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    borderRight: '1px solid var(--border)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  tabActive: {
    color: 'var(--text-primary)',
    background: 'var(--bg-primary)',
  },
  tabDisabled: {
    opacity: 0.4,
    cursor: 'default',
  },
  tabCloseButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '14px',
    height: '14px',
    borderRadius: '2px',
    color: 'var(--text-muted)',
    fontSize: '12px',
    lineHeight: 1,
    cursor: 'pointer',
    marginLeft: '4px',
    flexShrink: 0,
    padding: 0,
  },
  addTabButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 8px',
    fontSize: '14px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderRight: '1px solid var(--border)',
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
    marginRight: '4px',
  },
  terminalArea: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative' as const,
  },
  terminalContainer: {
    width: '100%',
    height: '100%',
    padding: '4px',
    boxSizing: 'border-box' as const,
  },
}
