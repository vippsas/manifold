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
import { SearchViewStore } from '../store/search-view-store'
import { BackgroundAgentHost } from '../background-agent-host/background-agent-host'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { ChatStore } from '../store/chat-store'
import type { MemoryStore } from '../memory/memory-store'
import type { AgentSession } from '../../shared/types'
import type { VercelHealthCheck } from '../deploy/vercel-health-check'

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
  searchViewStore: SearchViewStore
  backgroundAgentHost: BackgroundAgentHost
  chatAdapter: ChatAdapter
  chatStore: ChatStore
  memoryStore: MemoryStore
  vercelHealthCheck: VercelHealthCheck
}

export function resolveSession(sessionManager: SessionManager, sessionId: string): AgentSession {
  const session = sessionManager.getSession(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)
  return session
}
