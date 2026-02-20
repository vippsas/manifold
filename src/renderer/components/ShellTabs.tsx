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
  const [extraShells, setExtraShells] = useState<ExtraShell[]>([])
  const extraShellsRef = useRef<ExtraShell[]>([])
  extraShellsRef.current = extraShells

  const shellCounterRef = useRef(3)

  const worktreeTerminal = useTerminal({ sessionId: worktreeSessionId, scrollbackLines, xtermTheme })
  const projectTerminal = useTerminal({ sessionId: projectSessionId, scrollbackLines, xtermTheme })

  // Kill extra shells and reset state when agent changes or component unmounts
  useEffect(() => {
    return () => {
      for (const shell of extraShellsRef.current) {
        void window.electronAPI.invoke('agent:kill', shell.sessionId).catch(() => {})
      }
      setExtraShells([])
      shellCounterRef.current = 3
    }
  }, [worktreeSessionId])

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
    const result = (await window.electronAPI.invoke('shell:create', worktreeCwd)) as {
      sessionId: string
    }
    const label = `Shell ${shellCounterRef.current++}`
    setExtraShells((prev) => [...prev, { sessionId: result.sessionId, label }])
    setActiveTab(`extra-${result.sessionId}`)
  }, [worktreeCwd])

  const removeShell = useCallback(
    (sessionId: string) => {
      void window.electronAPI.invoke('agent:kill', sessionId).catch(() => {})
      setExtraShells((prev) => prev.filter((s) => s.sessionId !== sessionId))
      setActiveTab((prev) => {
        if (prev === `extra-${sessionId}`) {
          return worktreeSessionId ? 'worktree' : 'project'
        }
        return prev
      })
    },
    [worktreeSessionId]
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
            <div
              key={shell.sessionId}
              style={{
                ...styles.tab,
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                ...(isActive ? styles.tabActive : {}),
              }}
              onClick={() => setActiveTab(tabId)}
            >
              <span>{shell.label}</span>
              <button
                style={styles.tabCloseButton}
                onClick={(e) => {
                  e.stopPropagation()
                  removeShell(shell.sessionId)
                }}
                title={`Close ${shell.label}`}
              >
                ×
              </button>
            </div>
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
