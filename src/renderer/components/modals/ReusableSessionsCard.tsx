import React from 'react'
import type { AgentSession } from '../../../shared/types'
import { modalStyles } from './NewTaskModal.styles'
import { runtimeLabel } from '../sidebar/AgentItem'

function basename(input: string): string {
  const parts = input.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? input
}

function describeWorktree(projectPath: string, worktreePath: string): string {
  if (worktreePath === projectPath) return basename(projectPath)
  return basename(worktreePath)
}

function truncateWords(input: string, maxWords: number): string {
  const words = input.trim().split(/\s+/).filter(Boolean)
  if (words.length <= maxWords) return input.trim()
  return `${words.slice(0, maxWords).join(' ')}...`
}

interface Props {
  projectPath: string
  sessions: AgentSession[]
  onResumeSession?: (sessionId: string, runtimeId: string) => Promise<void>
  onDeleteSession?: (session: AgentSession) => void
}

export function ReusableSessionsCard({ projectPath, sessions, onResumeSession, onDeleteSession }: Props): React.JSX.Element | null {
  if (sessions.length === 0) return null
  return (
    <section style={modalStyles.infoCard}>
      <div style={modalStyles.infoCardTitle}>Existing worktrees</div>
      <div style={modalStyles.infoCardText}>
        Managed worktrees already exist for this repository. You can reconnect to one or remove it before starting a new agent.
      </div>
      <div style={modalStyles.infoCardList}>
        {sessions.map((session) => {
          const canResumeSession = Boolean(session.runtimeId)
          const repoName = basename(projectPath)
          const worktreeLabel = describeWorktree(projectPath, session.worktreePath)
          const agentLabel = canResumeSession ? runtimeLabel(session.runtimeId) : 'Missing runtime metadata'
          const contextLabel = session.taskDescription
            ? truncateWords(session.taskDescription, 12)
            : session.branchName
          return (
            <div key={session.id} style={modalStyles.infoCardRow}>
              <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={modalStyles.infoCardPrimary}>{repoName}</span>
                <span style={modalStyles.infoCardMeta}>{`Worktree: ${worktreeLabel}`}</span>
                <span style={modalStyles.infoCardSecondary}>{`Agent: ${agentLabel}`}</span>
                <span style={modalStyles.infoCardContext} title={session.taskDescription ?? session.branchName}>
                  {contextLabel}
                </span>
              </div>
              <div style={modalStyles.infoCardActions}>
                <button
                  type="button"
                  onClick={() => { if (canResumeSession) void onResumeSession?.(session.id, session.runtimeId) }}
                  disabled={!canResumeSession}
                  style={modalStyles.inlineActionButton}
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteSession?.(session)}
                  style={modalStyles.inlineDangerButton}
                >
                  Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
