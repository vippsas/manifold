import { writeWorktreeMeta } from '../git/worktree-meta'
import type { InternalSession } from './session-types'

export function persistSessionMeta(session: InternalSession): void {
  writeWorktreeMeta(session.worktreePath, {
    runtimeId: session.runtimeId,
    sessionId: session.id,
    displayName: session.displayName,
    taskDescription: session.taskDescription,
    simpleTemplateTitle: session.simpleTemplateTitle,
    simplePromptInstructions: session.simplePromptInstructions,
    additionalDirs: session.additionalDirs,
    ollamaModel: session.ollamaModel,
    workspaceId: session.workspaceId,
    workspaceWorktreePaths: session.workspaceWorktreePaths,
    nonInteractive: session.nonInteractive,
    codexThreadId: session.codexThreadId,
    locked: session.locked,
  }).catch((err) => {
    console.error(
      `[session-meta-persister] writeWorktreeMeta failed for ${session.id} (${session.worktreePath}) — nonInteractive=${session.nonInteractive} may be lost on next launch:`,
      err,
    )
  })
}
