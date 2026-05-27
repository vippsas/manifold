import type { AgentSession } from '../../shared/types'
import type { InternalSession } from './session-types'

export function toPublicSession(session: InternalSession): AgentSession {
  return {
    id: session.id,
    projectId: session.projectId,
    runtimeId: session.runtimeId,
    branchName: session.branchName,
    worktreePath: session.worktreePath,
    status: session.status,
    pid: session.pid,
    taskDescription: session.taskDescription,
    simpleTemplateTitle: session.simpleTemplateTitle,
    simplePromptInstructions: session.simplePromptInstructions,
    additionalDirs: session.additionalDirs,
    noWorktree: session.noWorktree,
    parentSuperagentId: session.parentSuperagentId,
    groupId: session.groupId,
    nonInteractive: session.nonInteractive,
  }
}
