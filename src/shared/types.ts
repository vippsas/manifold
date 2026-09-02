export interface AgentRuntime {
  id: string
  name: string
  binary: string
  /** CLI runtimes own a PTY. Orchestrators are native Manifold harnesses. */
  kind?: 'cli' | 'orchestrator'
  args?: string[]
  aiModelArgs?: string[]
  waitingPattern?: string
  env?: Record<string, string>
  installed?: boolean
  needsModel?: boolean
}

export type AgentStatus = 'running' | 'waiting' | 'done' | 'error'

export type AgentViewMode = 'terminal' | 'chat'

export interface AgentSettingsUpdate {
  displayName: string
  runtimeId: string
  viewMode: AgentViewMode
}

export interface AgentSession {
  id: string
  projectId: string
  runtimeId: string
  branchName: string
  /** Per-session base branch for diffs / PR target / ahead-behind. When set it
   *  overrides the project's base branch (e.g. a no-worktree agent based off a
   *  branch selected in the New Agent form). Falls back to the project base. */
  baseBranch?: string
  worktreePath: string
  status: AgentStatus
  pid: number | null
  displayName?: string
  taskDescription?: string
  simpleTemplateTitle?: string
  simplePromptInstructions?: string
  additionalDirs: string[]
  noWorktree?: boolean
  /** If set, this agent belongs to a workspace; its working set spans the workspace's repos. */
  workspaceId?: string
  /** projectId -> worktree path for every repo in this agent's working set (incl. primary). Used to tear down the full set. */
  workspaceWorktreePaths?: Record<string, string>
  /**
   * If set, this agent belongs to a group of siblings spawned together (e.g.
   * by a Watch playlist run). Grouped siblings are hidden from the default
   * dock tab bar; the group's owner UI (e.g. the Watch panel) handles
   * navigation to them.
   */
  groupId?: string
  /** True when this session runs Claude in non-interactive (chat) mode. */
  nonInteractive?: boolean
  /** Protects the agent from deletion until it is explicitly unlocked. Persisted
   *  in the worktree meta, so it survives a restart. Locking never stops or
   *  interrupts the agent — it only refuses to delete it. */
  locked?: boolean
}

/** How a folder added to a workspace reached one of its already-running agents.
 *  'live' — typed into the running agent, which confirmed it.
 *  'next-turn' — a chat agent rebuilds its working set on its next message.
 *  'restart-required' — the runtime takes folders only at launch (e.g. Codex).
 *  'manual' — the attempt failed; the user has to type the command themselves.
 *  'not-added' — the folder never joined the workspace at all, so there was no
 *  agent to reach; the add itself failed and would otherwise look like a click
 *  that did nothing. */
export type WorkingSetDelivery = 'live' | 'next-turn' | 'restart-required' | 'manual' | 'not-added'

export interface WorkingSetNotice {
  /** Empty on 'not-added': nothing reached an agent because nothing was added. */
  sessionId: string
  /** Empty on 'not-added', for the same reason. */
  agentName: string
  dir: string
  delivery: WorkingSetDelivery
  /** Command to type into the agent, when the user has to do it themselves. */
  command?: string
  /** Why the automatic attempt failed, for 'manual'. */
  error?: string
}

export type ProjectKind = 'git' | 'folder'

export interface Project {
  id: string
  name: string
  path: string
  baseBranch: string
  addedAt: string
  kind?: ProjectKind
  simpleTemplateTitle?: string
  simplePromptInstructions?: string
  /** Cached slash-command/skill names from Claude's last `system/init`, so the chat `/` autocomplete is populated before the first message. */
  slashCommands?: string[]
}

/** A favorite as written by the pre-workspaces build: a typed pointer to a
 *  Project or Workspace. Still read from disk and migrated on load — see
 *  `normalizeFavorites` — but never written again. */
export interface LegacyFavoriteRef {
  kind: 'repo' | 'workspace'
  id: string
}

/** What `settings.favorites` may hold: the current shape (a workspace id) or a
 *  legacy ref left by an older build. */
export type StoredFavorite = string | LegacyFavoriteRef

/** A favorite resolved against the live workspace list, for display.
 *
 *  Favorites are workspace ids and nothing else: every sidebar root is a
 *  workspace, and a workspace *is* a checkout, so favouriting a worktree and
 *  favouriting a workspace are the same act. Repos have no root row of their own
 *  to star, and a bare repo id could not say which of its checkouts it meant. */
export interface ResolvedFavorite {
  id: string
  name: string
  /** Whether the workspace owns its own checkout, so the row can carry the same
   *  branch-or-folder glyph the workspace list below it does. */
  worktree: boolean
}

export interface CreateProjectOptions {
  description: string
  repoName?: string
  targetDir?: string
  projectKind?: ProjectKind
}

export type FileChangeType = 'added' | 'modified' | 'deleted'

export interface FileChange {
  path: string
  type: FileChangeType
  /**
   * True when the file differs only because the base branch advanced (e.g.
   * another worktree's work landed on it), not because this worktree changed
   * it. Absent for the worktree's own changes. See DiffProvider.getChangedFiles.
   */
  foreignWorktree?: boolean
  /**
   * True when this is a direct working-tree change — an uncommitted edit or
   * untracked file, i.e. present in `git status`. Absent/false when the path
   * only differs relative to the base branch (committed on this branch, clean
   * in the worktree). Set by mergeFileChanges; the file tree renders a faint
   * dot instead of an A/M/D letter for changes that aren't worktree-dirty.
   */
  worktreeDirty?: boolean
}

export interface FileTreeNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileTreeNode[]
}

export interface EditorSettings {
  fontSize: number
  fontFamily: string
  wordWrap: 'on' | 'off'
  /** Force-wrap Markdown files; when false they follow `wordWrap` like any other file. */
  markdownWordWrap: boolean
  minimap: boolean
  tabSize: number
}

/** Which context segments the built-in Manifold shell prompt renders. */
export interface ShellPromptSegments {
  repo: boolean
  agent: boolean
  k8sContext: boolean
  k8sNamespace: boolean
}

export type NotificationScope = 'non-active' | 'unfocused' | 'always'

/** Desktop (OS) notifications for agent lifecycle transitions. macOS Focus / DND
 *  is respected natively, so there is no in-app quiet-hours schedule. */
export interface NotificationSettings {
  /** Master switch for all desktop notifications. */
  enabled: boolean
  /** Notify when a session transitions to `done`. */
  onDone: boolean
  /** Notify when a session transitions to `waiting` (needs input). */
  onWaiting: boolean
  /** Notify when a session transitions to `error`. */
  onError: boolean
  /** Which sessions raise a notification. */
  scope: NotificationScope
}

export interface ManifoldSettings {
  storagePath: string
  setupCompleted: boolean
  lastSeenReleaseNotesVersion: string
  defaultRuntime: string
  defaultAgentMode?: 'interactive' | 'chat'
  theme: string
  scrollbackLines: number
  terminalFontFamily: string
  defaultBaseBranch: string
  notificationSound: boolean
  notifications?: NotificationSettings
  shellPrompt: boolean
  shellPromptSegments?: ShellPromptSegments
  shellHistoryScope: 'project' | 'global'
  uiMode: 'developer' | 'simple'
  autoGenerateMessages: boolean
  showCommitAndPrButtons: boolean
  sidebarResizeReversed: boolean
  /** Ordered favorites, in the user's own order. Index 0 maps to ⌘1. Written as
   *  workspace ids; older builds wrote `{kind, id}` refs, which are migrated on
   *  read and replaced the next time favorites are changed. */
  favorites?: StoredFavorite[]
  keepAwake: boolean
  memory?: import('./memory-types').MemorySettings
  search?: SearchSettings
  editor?: EditorSettings
  uiScale?: number
  transcription?: import('./plugins/api-types').AiServiceSettings
  pluginConfig?: Record<string, Record<string, unknown>>
  /** Plugin IDs that have been explicitly disabled by the user. */
  disabledPlugins?: string[]
  /** Internal: which default-disabled plugin ids have already been seeded into
   *  `disabledPlugins`. Prevents re-disabling a plugin the user later enables, while
   *  still letting a newly default-disabled plugin reach an existing config. */
  seededDisabledPlugins?: string[]
}

export interface ReleaseNotes {
  version: string
  name: string
  body: string
  url: string
  publishedAt: string | null
  source: 'github' | 'fallback'
}

export interface SearchAiSettings {
  enabled: boolean
  mode: 'answer' | 'rerank'
  runtimeId: 'default' | string
  citationLimit: number
  maxContextResults: number
}

export interface SearchSettings {
  ai: SearchAiSettings
}

export interface SessionEditorPaneState {
  id: string
  openFilePaths: string[]
  activeFilePath: string | null
}

export interface SessionViewState {
  openFilePaths: string[]
  activeFilePath: string | null
  expandedPaths: string[]
  editorPanes?: SessionEditorPaneState[]
  activeEditorPaneId?: string | null
}

export interface SpawnAgentOptions {
  projectId: string
  runtimeId: string
  prompt: string
  /** The agent's name, as typed in the New Agent form. Shown on its tab. */
  displayName?: string
  userMessage?: string
  simpleTemplateTitle?: string
  simplePromptInstructions?: string
  branchName?: string
  existingBranch?: string
  /** Branch/ref a new worktree or no-worktree branch starts from. For no-worktree
   *  agents it is also the session's diff/PR base. Defaults to the project's base
   *  branch when omitted. Set by the New Agent form or a sibling orchestrator. */
  baseBranch?: string
  prIdentifier?: string
  noWorktree?: boolean
  stayOnBranch?: boolean
  /** Skip the clean-working-tree check on the no-worktree new-branch path. Set
   *  after the user confirms carrying uncommitted changes onto the new branch. */
  allowDirtyWorktree?: boolean
  /** The user left the name blank, so `prompt` is an auto-generated placeholder
   *  (a random city, used only as a branch hint). For a no-worktree agent this
   *  suppresses the placeholder as the task so the agent is named by its branch. */
  autoName?: boolean
  nonInteractive?: boolean
  cols?: number
  rows?: number
  ollamaModel?: string
  /**
   * Attach the session to an existing worktree instead of creating a new one.
   * Used when a workspace's worktree already exists and we want to
   * spawn an interactive session inside it.
   */
  existingWorktreePath?: string
  /** If set, the spawned session belongs to this workspace. */
  workspaceId?: string
  /** Extra repo roots (the workspace's other repos) injected into the runtime at launch and recorded on the session. */
  additionalDirs?: string[]
  /** projectId -> worktree path for the full working set, persisted for teardown. */
  workspaceWorktreePaths?: Record<string, string>
  /**
   * Tags the session as part of a sibling group (e.g. a Watch playlist run).
   * Grouped siblings are hidden from the default dock tab bar; the group's
   * owner UI handles navigation to them.
   */
  groupId?: string
}

export interface CreatePROptions {
  sessionId: string
  title?: string
  body?: string
}

export interface BranchInfo {
  name: string
  source: 'local' | 'remote' | 'both'
  /** Remote owning the tracking ref when one exists. Older callers may omit it. */
  remote?: string
}

export interface PRInfo {
  number: number
  title: string
  headRefName: string
  author: string
}

export interface AheadBehind {
  ahead: number
  behind: number
}

export interface PRContext {
  commits: string
  diffStat: string
  diffPatch: string
}

export interface FetchResult {
  updatedBranch: string
  previousRef: string
  currentRef: string
  commitCount: number
}

/**
 * A live session's usage plus an estimated dollar cost.
 *
 * `costUsd` is derived from Anthropic's published API rates (Claude records
 * tokens, never prices), so it is an estimate — and on a subscription plan it is
 * what the API *would* have charged rather than money spent. It is null when no
 * model in the session could be priced; `unpricedModels` names the models that
 * are missing from the price table, so a partial total can say so.
 */
export interface SessionCostSummary {
  tokenUsage: import('./verdict-types').TokenUsage
  turns: number
  costUsd: number | null
  unpricedModels: string[]
  /** Per-model rows, most expensive first, for the tooltip's breakdown table. */
  byModel: SessionCostRow[]
}

/** One model's share of a session: where its tokens went and what they cost. */
export interface SessionCostRow {
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number | null
}
