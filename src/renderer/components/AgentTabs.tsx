import React, { useCallback } from 'react'
import type { AgentSession, AgentStatus } from '../../shared/types'

interface AgentTabsProps {
  sessions: AgentSession[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewAgent: () => void
}

const RUNTIME_LABELS: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  custom: 'Custom',
}

function statusDotClass(status: AgentStatus): string {
  return `status-dot status-dot--${status}`
}

function formatBranch(branchName: string): string {
  return branchName.replace('manifold/', '')
}

function runtimeLabel(runtimeId: string): string {
  return RUNTIME_LABELS[runtimeId] ?? runtimeId
}

export function AgentTabs({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewAgent,
}: AgentTabsProps): React.JSX.Element {
  return (
    <div className="layout-tab-bar">
      {sessions.map((session) => (
        <AgentTab
          key={session.id}
          session={session}
          isActive={session.id === activeSessionId}
          onSelect={onSelectSession}
        />
      ))}
      <button onClick={onNewAgent} style={tabStyles.newButton} title="Launch new agent">
        + New Agent
      </button>
    </div>
  )
}

interface AgentTabProps {
  session: AgentSession
  isActive: boolean
  onSelect: (id: string) => void
}

function AgentTab({
  session,
  isActive,
  onSelect,
}: AgentTabProps): React.JSX.Element {
  const handleClick = useCallback((): void => {
    onSelect(session.id)
  }, [onSelect, session.id])

  return (
    <button
      onClick={handleClick}
      style={{
        ...tabStyles.tab,
        background: isActive ? 'var(--bg-primary)' : 'transparent',
        borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
      }}
      title={`${runtimeLabel(session.runtimeId)} - ${session.branchName}`}
    >
      <span className={statusDotClass(session.status)} />
      <span className="truncate mono" style={tabStyles.branch}>
        {formatBranch(session.branchName)}
      </span>
      <span style={tabStyles.runtime}>{runtimeLabel(session.runtimeId)}</span>
    </button>
  )
}

const tabStyles: Record<string, React.CSSProperties> = {
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 12px',
    borderRadius: '4px 4px 0 0',
    fontSize: '12px',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap' as const,
    maxWidth: '200px',
    cursor: 'pointer',
    transition: 'background 0.1s ease',
  },
  branch: {
    fontSize: '11px',
  },
  runtime: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
  },
  newButton: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 12px',
    fontSize: '12px',
    color: 'var(--accent)',
    whiteSpace: 'nowrap' as const,
    marginLeft: '4px',
  },
}
