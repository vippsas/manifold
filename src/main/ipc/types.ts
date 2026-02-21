import { SettingsStore } from '../settings-store'
import { ProjectRegistry } from '../project-registry'
import { SessionManager } from '../session-manager'
import { FileWatcher } from '../file-watcher'
import { DiffProvider } from '../diff-provider'
import { PrCreator } from '../pr-creator'
import { ViewStateStore } from '../view-state-store'
import { ShellTabStore } from '../shell-tab-store'
import { GitOperationsManager } from '../git-operations'
import type { AgentSession } from '../../shared/types'

export interface IpcDependencies {
  settingsStore: SettingsStore
  projectRegistry: ProjectRegistry
  sessionManager: SessionManager
  fileWatcher: FileWatcher
  diffProvider: DiffProvider
  prCreator: PrCreator
  viewStateStore: ViewStateStore
  shellTabStore: ShellTabStore
  gitOps: GitOperationsManager
}

export function resolveSession(sessionManager: SessionManager, sessionId: string): AgentSession {
  const session = sessionManager.getSession(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)
  return session
}
