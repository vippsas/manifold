import { SettingsStore } from '../store/settings-store'
import { ProjectRegistry } from '../store/project-registry'
import { SessionManager } from '../session/session-manager'
import { FileWatcher } from '../fs/file-watcher'
import { DiffProvider } from '../git/diff-provider'
import { PrCreator } from '../git/pr-creator'
import { ViewStateStore } from '../store/view-state-store'
import { ShellTabStore } from '../store/shell-tab-store'
import { GitOperationsManager } from '../git/git-operations'
import { BranchCheckoutManager } from '../git/branch-checkout-manager'
import { DockLayoutStore } from '../store/dock-layout-store'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { DeploymentManager } from '../app/deployment-manager'
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
  branchCheckout: BranchCheckoutManager
  dockLayoutStore: DockLayoutStore
  chatAdapter: ChatAdapter
  deploymentManager: DeploymentManager
}

export function resolveSession(sessionManager: SessionManager, sessionId: string): AgentSession {
  const session = sessionManager.getSession(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)
  return session
}
