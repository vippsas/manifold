import type { AgentSession } from '../../shared/types'
import type { InternalSession } from './session-types'

export function toPublicSession(session: InternalSession): AgentSession {
  return {
    id: session.id,
    projectId: session.projectId,
    runtimeId: session.runtimeId,
    branchName: session.branchName,
    baseBranch: session.baseBranch,
    worktreePath: session.worktreePath,
    status: session.status,
    pid: session.pid,
    displayName: session.displayName,
    taskDescription: session.taskDescription,
    simpleTemplateTitle: session.simpleTemplateTitle,
    simplePromptInstructions: session.simplePromptInstructions,
    additionalDirs: session.additionalDirs,
    noWorktree: session.noWorktree,
    workspaceId: session.workspaceId,
    workspaceWorktreePaths: session.workspaceWorktreePaths,
    groupId: session.groupId,
    nonInteractive: session.nonInteractive,
    locked: session.locked,
  }
}
