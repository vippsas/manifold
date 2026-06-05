// src/plugin-host/workspace-api.ts
import type { Disposable, ProjectInfo, SessionInfo, ManifoldApi } from '../shared/plugins/api-types'

export interface ActiveContext { project?: ProjectInfo; session?: SessionInfo }

/** Host-side singleton holding the latest active context pushed from the renderer
 *  and notifying subscribers. Shared across all plugins (one workspace). */
export class WorkspaceContext {
  private context: ActiveContext = {}
  private readonly projectListeners = new Set<(p: ProjectInfo | undefined) => void>()
  private readonly sessionListeners = new Set<(s: SessionInfo | undefined) => void>()

  setActiveContext(next: ActiveContext): void {
    const projectChanged = next.project?.id !== this.context.project?.id
    const sessionChanged = next.session?.id !== this.context.session?.id
    this.context = next
    if (projectChanged) for (const l of this.projectListeners) l(next.project)
    if (sessionChanged) for (const l of this.sessionListeners) l(next.session)
  }

  /** Per-plugin workspace namespace reading this shared context. */
  makeApi(): ManifoldApi['workspace'] {
    const self = this
    return {
      get activeProject(): ProjectInfo | undefined { return self.context.project },
      get activeSession(): SessionInfo | undefined { return self.context.session },
      onDidChangeActiveProject(listener): Disposable {
        self.projectListeners.add(listener)
        return { dispose: () => self.projectListeners.delete(listener) }
      },
      onDidChangeActiveSession(listener): Disposable {
        self.sessionListeners.add(listener)
        return { dispose: () => self.sessionListeners.delete(listener) }
      },
    }
  }
}
