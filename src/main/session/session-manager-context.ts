import { WorktreeManager } from '../git/worktree-manager'
import { BranchCheckoutManager } from '../git/branch-checkout-manager'
import { PtyPool } from '../agent/pty-pool'
import { ProjectRegistry } from '../store/project-registry'
import { DevServerManager } from '../app/dev-server-manager'
import { SessionCreator } from './session-creator'
import { SessionTeardown } from './session-teardown'
import { persistSessionMeta } from './session-meta-persister'
import { FileWatcher } from '../fs/file-watcher'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { MemoryCapture } from '../memory/memory-capture'
import type { MemoryCompressor } from '../memory/memory-compressor'
import type { MemoryInjector } from '../memory/memory-injector'
import type { BrowserWindow } from 'electron'
import type { InternalSession } from './session-types'
import { SessionStreamWirer } from './session-stream-wirer'
import { SessionUsageAccumulator } from './session-usage-accumulator'
import { SessionDiscovery } from './session-discovery'
import { ShellSessionController } from './shell-session-controller'
import { SessionKiller } from './session-killer'
import { SessionLifecycle } from './session-lifecycle'
import { SessionIoController } from './session-io-controller'
import { SessionWorkingSet } from './session-working-set'
import type { VerdictRecorder } from './verdict-recorder'
import type { DismissedAgentsStore } from '../store/dismissed-agents-store'

/** Shared state and collaborator wiring for the SessionManager facade. */
export abstract class SessionManagerContext {
  protected sessions: Map<string, InternalSession> = new Map()
  protected mainWindow: BrowserWindow | null = null
  protected chatAdapter: ChatAdapter | null = null
  protected memoryCapture: MemoryCapture | null = null
  protected memoryCompressor: MemoryCompressor | null = null
  protected memoryInjector: MemoryInjector | null = null
  protected streamWirer: SessionStreamWirer
  protected devServer: DevServerManager
  protected discovery: SessionDiscovery
  protected sessionCreator: SessionCreator
  protected teardown: SessionTeardown
  protected shellController: ShellSessionController
  protected killer: SessionKiller
  protected ioController: SessionIoController
  protected workingSet: SessionWorkingSet
  protected lifecycle: SessionLifecycle
  protected verdictRecorder: VerdictRecorder | null = null
  protected dismissedAgents: Pick<DismissedAgentsStore, 'has' | 'delete'> | null = null
  protected readonly usageAccumulator = new SessionUsageAccumulator()

  constructor(
    worktreeManager: WorktreeManager,
    protected ptyPool: PtyPool,
    protected projectRegistry: ProjectRegistry,
    branchCheckoutManager?: BranchCheckoutManager,
    protected fileWatcher?: FileWatcher,
    getThemeType?: () => 'light' | 'dark',
  ) {
    this.streamWirer = new SessionStreamWirer(
      this.ptyPool,
      () => this.chatAdapter,
      this.sendToRenderer.bind(this),
      this.fileWatcher,
      persistSessionMeta,
      (session) => this.devServer.startDevServer(session),
      (session, commands) => this.cacheSlashCommands(session.projectId, commands),
      (session, usage) => this.usageAccumulator.recordTurn(session.id, usage),
      (session, runId, usage, turns) => this.usageAccumulator.replaceRun(session.id, runId, usage, turns),
      persistSessionMeta,
    )
    this.devServer = new DevServerManager(
      this.ptyPool,
      () => this.chatAdapter,
      this.sessions,
      this.projectRegistry,
      this.sendToRenderer.bind(this),
      this.streamWirer,
      (id) => this.killSession(id),
    )
    this.discovery = new SessionDiscovery(
      this.sessions,
      worktreeManager,
      this.projectRegistry,
      // Restored panes may already have received an empty read for this id.
      (session) => this.sendToRenderer('files:tree-changed', {
        sessionId: session.id, rootPath: session.worktreePath,
      }),
    )
    this.sessionCreator = new SessionCreator(
      worktreeManager,
      this.ptyPool,
      this.projectRegistry,
      this.streamWirer,
      () => this.chatAdapter,
      branchCheckoutManager,
      () => this.memoryInjector,
      getThemeType,
    )
    this.teardown = new SessionTeardown(
      this.sessions,
      this.ptyPool,
      this.projectRegistry,
      (id) => this.killSession(id),
      () => this.memoryCompressor,
    )
    this.shellController = new ShellSessionController(
      this.ptyPool,
      this.streamWirer,
      this.sessions,
    )
    this.killer = new SessionKiller({
      sessions: this.sessions,
      ptyPool: this.ptyPool,
      getFileWatcher: () => this.fileWatcher,
      getMemoryCapture: () => this.memoryCapture,
      getChatAdapter: () => this.chatAdapter,
      notifySessionsChanged: (projectId) => this.notifySessionsChanged(projectId),
    })
    this.ioController = new SessionIoController({
      sessions: this.sessions,
      ptyPool: this.ptyPool,
      shellController: this.shellController,
      getMemoryCapture: () => this.memoryCapture,
      spawnPrintModeFollowUp: (session, input) => this.devServer.spawnPrintModeFollowUp(session, input),
      trackActivity: (session) => this.streamWirer.trackActivity(session),
    })
    this.workingSet = new SessionWorkingSet({
      sessions: this.sessions,
      ptyPool: this.ptyPool,
      getFileWatcher: () => this.fileWatcher,
      persist: persistSessionMeta,
      sendToRenderer: (channel, payload) => this.sendToRenderer(channel, payload),
    })
    this.lifecycle = new SessionLifecycle({
      sessions: this.sessions,
      projectRegistry: this.projectRegistry,
      sessionCreator: this.sessionCreator,
      ptyPool: this.ptyPool,
      streamWirer: this.streamWirer,
      probeSlashCommands: (session) => this.devServer.probeSlashCommands(session),
      getMemoryCapture: () => this.memoryCapture,
      getMemoryInjector: () => this.memoryInjector,
      getVerdictRecorder: () => this.verdictRecorder,
      getDismissedAgents: () => this.dismissedAgents,
      notifySessionsChanged: (projectId) => this.notifySessionsChanged(projectId),
    })
    this.fileWatcher?.setOnBranchChanged((sessionId, branch) => this.applyBranchChange(sessionId, branch))
  }

  /** A session's branch is not fixed at creation: the agent runs `git checkout -b`,
   *  the PR flow renames the branch, or the user switches it in the shell. The
   *  name is what the status bar shows and what "Create PR" pushes, so follow the
   *  checkout instead of keeping the name the session started on. A checkout is on
   *  one branch, so this moves every sibling agent working in it — the watcher
   *  polls the path once, under whichever session id last watched it. */
  protected applyBranchChange(sessionId: string, branch: string): void {
    const watched = this.sessions.get(sessionId)
    if (!watched) return

    const affectedProjects = new Set<string>()
    for (const session of this.sessions.values()) {
      if (session.worktreePath !== watched.worktreePath) continue
      if (session.branchName === branch) continue
      session.branchName = branch
      affectedProjects.add(session.projectId)
    }
    for (const projectId of affectedProjects) this.notifySessionsChanged(projectId)
  }

  /** Persist the captured slash-command list on the project so future chat sessions have it before the first message. */
  protected cacheSlashCommands(projectId: string, commands: string[]): void {
    const project = this.projectRegistry.getProject(projectId)
    if (project && JSON.stringify(project.slashCommands) !== JSON.stringify(commands)) {
      this.projectRegistry.updateProject(projectId, { slashCommands: commands })
    }
  }

  abstract killSession(sessionId: string): Promise<void>
  protected abstract sendToRenderer(channel: string, ...args: unknown[]): void
  protected abstract notifySessionsChanged(projectId: string): void
}
