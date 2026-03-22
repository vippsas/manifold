import type { SessionManager } from '../session/session-manager'
import type { SearchContextResponse, SearchContextSession } from '../../shared/search-types'

export async function getSearchContext(
  sessionManager: SessionManager,
  projectId: string,
  activeSessionId: string | null,
): Promise<SearchContextResponse> {
  const sessions = await sessionManager.discoverSessionsForProject(projectId)
  const mapped: SearchContextSession[] = sessions
    .map((session) => ({
      sessionId: session.id,
      branchName: session.branchName,
      runtimeId: session.runtimeId,
      worktreePath: session.worktreePath,
      additionalDirs: session.additionalDirs,
      status: session.status,
    }))
    .sort((left, right) => {
      if (left.sessionId === activeSessionId) return -1
      if (right.sessionId === activeSessionId) return 1
      return left.branchName.localeCompare(right.branchName)
    })

  return {
    projectId,
    activeSessionId,
    sessions: mapped,
  }
}
