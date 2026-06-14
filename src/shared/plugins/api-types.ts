// src/shared/plugins/api-types.ts
import type { QuickPickItem, QuickPickOptions, InputBoxOptions } from './ui'

export interface Disposable { dispose(): void }

export interface ProjectInfo { id: string; name: string; path: string }
export interface SessionInfo { id: string; status: string; branchName?: string; worktreePath?: string; runtimeId?: string }

export interface CancellationToken {
  readonly isCancellationRequested: boolean
  onCancellationRequested(listener: () => void): Disposable
}

export type TurnOutcome = 'ended' | 'timeout' | 'aborted'

/** Live status of a (possibly spawned) agent session; 'missing' = no such session. */
export type SpawnedSessionStatus = 'running' | 'waiting' | 'done' | 'error' | 'missing'

/** A live agent session a built-in plugin can drive. VS Code has no agent-turn
 *  concept, so this is Manifold-specific. `runTurn` is gated by `agent:control`;
 *  the raw-PTY methods (sendText/whenReady/getStatus/kill/reveal) by `agent:spawn`. */
export interface AgentSession {
  readonly sessionId: string
  /** [agent:control] Send a prompt to the live agent and resolve when its turn ends. */
  runTurn(
    prompt: string,
    opts?: { budgetSeconds?: number; clearContext?: boolean },
    token?: CancellationToken,
  ): Promise<TurnOutcome>
  /** [agent:spawn] Raw PTY input passthrough; the caller owns typing rhythm
   *  (text, delay, then '\r'). */
  sendText(text: string): Promise<void>
  /** [agent:spawn] True once the TUI prompt is rendered (status 'waiting');
   *  false on timeout/missing — callers may proceed (non-fatal). */
  whenReady(timeoutMs?: number): Promise<boolean>
  /** [agent:spawn] */
  getStatus(): Promise<SpawnedSessionStatus>
  /** [agent:spawn] Best-effort session kill. */
  kill(): Promise<void>
  /** [agent:spawn] Ask the app to open this session's panel in the dock. */
  reveal(title?: string): Promise<void>
}

/** A language model handle, modeled on VS Code's `LanguageModelChat`. Phase A is
 *  one-shot (non-streaming); gated by the `lm` capability. */
export interface LanguageModelChat {
  readonly id: string
  sendRequest(
    prompt: string,
    opts?: { timeoutMs?: number },
    token?: CancellationToken,
  ): Promise<{ text: string }>
}

/** App-level AI-service settings (transcription + chat keys), shared with core
 *  consumers (settings UI, verdict-recorder, prompt-summarizer). Exposed to
 *  built-in plugins via `manifold.transcription` (gated by `transcription:read`). */
export type AiServiceProvider = 'openai' | 'azure' | 'none'

export interface AiServiceSettings {
  provider: AiServiceProvider
  openaiApiKey?: string
  azureApiKey?: string
  azureEndpoint?: string
  azureDeployment?: string          // transcription deployment (existing)
  chatModel?: string                // text/chat model (default 'gpt-5.1')
  azureChatDeployment?: string      // Azure chat deployment (no default)
}

/** A workspace folder, modeled on VS Code's `WorkspaceFolder`. */
export interface WorkspaceFolder {
  readonly name: string
  /** Absolute filesystem path of the worktree. */
  readonly uri: string
}

export interface ManifoldContext {
  subscriptions: Disposable[]
  /** Absolute path to the plugin's folder. */
  pluginUri: string
}

export interface TreeItem {
  label: string
  collapsibleState?: 0 | 1 | 2  // None | Collapsed | Expanded (matches vscode.TreeItemCollapsibleState)
  id?: string
  description?: string
  tooltip?: string
  iconPath?: string             // codicon-ish name (subset)
  command?: { command: string; arguments?: unknown[] }
}
export interface TreeDataProvider<T = unknown> {
  getChildren(element?: T): T[] | undefined | Promise<T[] | undefined>
  getTreeItem(element: T): TreeItem | Promise<TreeItem>
  onDidChangeTreeData?: (listener: () => void) => Disposable
}
export interface TreeView extends Disposable { /* C2: opaque handle; reveal/selection deferred */ }

export interface WebviewView {
  webview: {
    html: string
    postMessage(message: unknown): void
    onDidReceiveMessage(listener: (message: unknown) => void): Disposable
  }
}
export interface WebviewViewProvider {
  resolveWebviewView(view: WebviewView): void | Promise<void>
}

export type WorktreeStatus = 'active' | 'idle' | 'stale'

/** One Manifold-managed worktree in the overview. */
export interface WorktreeOverviewEntry {
  worktreePath: string
  projectId: string
  projectName: string
  branch: string
  /** active = a live agent owns it; idle = managed, no live agent; stale = directory gone. */
  status: WorktreeStatus
  /** The owning agent session, when one exists. */
  sessionId: string | null
  ahead: number
  behind: number
  dirty: boolean
  lastCommitISO: string | null
  locked: boolean
}

/** A local branch with no worktree that is already merged into its repo's base branch. */
export interface BranchOverviewEntry {
  projectId: string
  projectName: string
  branch: string
  lastCommitISO: string | null
}

/** The `manifold` module surface (Phase 1b: commands only). */
export interface ManifoldApi {
  commands: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerCommand(id: string, handler: (...args: any[]) => unknown): Disposable
    executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>
  }
  window: {
    registerWebviewViewProvider(viewId: string, provider: WebviewViewProvider): Disposable
    registerTreeDataProvider(viewId: string, provider: TreeDataProvider): Disposable
    createTreeView(viewId: string, options: { treeDataProvider: TreeDataProvider }): TreeView
    showInformationMessage(message: string, ...actions: string[]): Promise<string | undefined>
    showWarningMessage(message: string, ...actions: string[]): Promise<string | undefined>
    showErrorMessage(message: string, ...actions: string[]): Promise<string | undefined>
    showQuickPick(items: ReadonlyArray<string | QuickPickItem>, options?: QuickPickOptions): Promise<QuickPickItem | string | undefined>
    showInputBox(options?: InputBoxOptions): Promise<string | undefined>
  }
  storage: {
    global: {
      get<T = unknown>(key: string, defaultValue?: T): Promise<T | undefined>
      update(key: string, value: unknown): Promise<void>
    }
  }
  workspace: {
    readonly activeProject: ProjectInfo | undefined
    readonly activeSession: SessionInfo | undefined
    readonly workspaceFolders: readonly WorkspaceFolder[] | undefined
    onDidChangeActiveProject(listener: (project: ProjectInfo | undefined) => void): Disposable
    onDidChangeActiveSession(listener: (session: SessionInfo | undefined) => void): Disposable
  }
  configuration: {
    get<T = unknown>(key: string, defaultValue?: T): Promise<T | undefined>
    onDidChange(listener: () => void): Disposable
  }
  agents: {
    readonly activeAgent: AgentSession | undefined
    getAgent(sessionId: string): AgentSession | undefined
    /** [agent:spawn] Spawn a sibling session sharing the base session's
     *  project/runtime/worktree (derived main-side). */
    spawnSibling(baseSessionId: string, opts?: { title?: string; groupId?: string }): Promise<AgentSession>
  }
  lm: {
    /** Resolve language models. Pass `sessionId` to target a specific agent
     *  session's runtime (e.g. a loop pinned to its starting session); omit it
     *  to use the currently-active session. */
    selectChatModels(sessionId?: string): Promise<LanguageModelChat[]>
  }
  transcription: {
    /** [transcription:read] App-level AI-service settings (undefined when unconfigured). */
    get(): Promise<AiServiceSettings | undefined>
  }
  worktrees: {
    /** [workspace:manage] All Manifold-managed worktrees across all registered repos. */
    list(): Promise<WorktreeOverviewEntry[]>
    /** [workspace:manage] Remove one managed worktree. Rejects on uncommitted/unpushed/locked unless `force`. */
    remove(worktreePath: string, opts?: { force?: boolean }): Promise<void>
    /** [workspace:manage] Remove all stale (directory-gone) managed worktrees; returns removed paths. */
    pruneStale(): Promise<string[]>
    /** [workspace:manage] Local branches with no worktree, already merged into base — safe-to-delete leftovers. */
    listBranches(): Promise<BranchOverviewEntry[]>
  }
}

/** Shape a plugin's entry module must export. */
export interface PluginModule {
  activate?: (context: ManifoldContext) => void | Promise<void>
  deactivate?: () => void | Promise<void>
}
