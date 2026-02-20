import React, { useState } from 'react'
import { useTerminal } from '../hooks/useTerminal'

type ShellTab = 'worktree' | 'project'

interface ShellTabsProps {
  worktreeSessionId: string | null
  projectSessionId: string | null
  scrollbackLines: number
  theme?: 'dark' | 'light'
  onClose?: () => void
}

export function ShellTabs({
  worktreeSessionId,
  projectSessionId,
  scrollbackLines,
  theme = 'dark',
  onClose,
}: ShellTabsProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<ShellTab>(
    worktreeSessionId ? 'worktree' : 'project'
  )

  const worktreeTerminal = useTerminal({ sessionId: worktreeSessionId, scrollbackLines, theme })
  const projectTerminal = useTerminal({ sessionId: projectSessionId, scrollbackLines, theme })

  // Auto-select project tab when no agent is selected
  const effectiveTab = !worktreeSessionId && activeTab === 'worktree' ? 'project' : activeTab

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
