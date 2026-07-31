import { app, BrowserWindow, crashReporter, ipcMain, nativeTheme } from 'electron'
import * as path from 'node:path'
import type { AgentStatus } from '../../shared/types'
import { loadShellPath } from './shell-path'
import { configureDevProfilePaths } from './dev-profile'
import { startCrashDiagnostics } from './crash-diagnostics'
import { configureLinuxRendering } from './linux-rendering'

configureLinuxRendering(app)

loadShellPath()
configureDevProfilePaths(app)
const crashDiagnostics = startCrashDiagnostics({
  app,
  crashReporter,
  root: path.join(app.getPath('userData'), 'diagnostics'),
})
void app.whenReady().then(() => {
  crashDiagnostics.recordGpuStatus({ ...app.getGPUFeatureStatus() })
})

// Remove env vars set by parent CLI agents so spawned agents don't detect
// themselves as nested sessions and refuse to start.
delete process.env.CLAUDECODE

import { SettingsStore } from '../store/settings-store'
import { ProjectRegistry } from '../store/project-registry'
import { WorktreeManager } from '../git/worktree-manager'
import { PtyPool } from '../agent/pty-pool'
import { SessionManager } from '../session/session-manager'
import { FileWatcher } from '../fs/file-watcher'
import { lookupWorktreePrUrl } from '../fs/verdict-poll-forwarder'
import { ChokidarTreeWatcher } from '../fs/tree-watcher'
import { DiffProvider } from '../git/diff-provider'
import { PrCreator } from '../git/pr-creator'
import { ViewStateStore } from '../store/view-state-store'
import { ShellTabStore } from '../store/shell-tab-store'
import { GitOperationsManager } from '../git/git-operations'
import { BranchCheckoutManager } from '../git/branch-checkout-manager'
import { DockLayoutStore } from '../store/dock-layout-store'
import { SearchViewStore } from '../store/search-view-store'
import { DismissedAgentsStore } from '../store/dismissed-agents-store'
import { ChatStore } from '../store/chat-store'
import { ChatAdapter } from '../agent/chat-adapter'
import { ModeSwitcher } from './mode-switcher'
import { registerAppLifecycle } from './app-lifecycle'
import { createWindow, rebuildAppMenu } from './window-factory'
import { PowerManager } from './power-manager'
import { MemoryStore } from '../memory/memory-store'
import { MemoryCapture } from '../memory/memory-capture'
import { MemoryCompressor } from '../memory/memory-compressor'
import { MemoryInjector } from '../memory/memory-injector'
import { WorkspaceStore } from '../workspace/workspace-store'
import { WorkspaceManager } from '../workspace/workspace-manager'
import { VerdictStore } from '../store/verdict-store'
import { VerdictRecorder } from '../session/verdict-recorder'
import { readClaudeTranscriptUsage, readClaudeTranscriptUsageSync, claudeProjectsDir, type SessionUsage } from '../session/transcript-usage-reader'
import { codexHomeDir, readCodexUsage, readCodexUsageSync } from '../session/codex-usage-reader'
import { summarizeMiddle } from '../store/prompt-summarizer'
import { PluginManager } from '../plugins/plugin-manager'
import { registerWebviewSchemePrivileged } from '../plugins/webview-protocol'
import { AgentNotifier } from '../notifications/agent-notifier'

let mainWindow: BrowserWindow | null = null

// ── Module instances ─────────────────────────────────────────────────
const settingsStore = new SettingsStore()
const powerManager = new PowerManager()
const projectRegistry = new ProjectRegistry()
const worktreeManager = new WorktreeManager(settingsStore.getSettings().storagePath)
const branchCheckout = new BranchCheckoutManager(settingsStore.getSettings().storagePath)
const ptyPool = new PtyPool()
const fileWatcher = new FileWatcher(undefined, new ChokidarTreeWatcher())
// nativeTheme tracks Manifold's current light/dark theme — the renderer's
// `theme:changed` IPC (see mode-switcher) sets themeSource on every theme
// change. Used to launch the embedded Claude Code with a matching ANSI theme.
const getThemeType = (): 'light' | 'dark' => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
const sessionManager = new SessionManager(worktreeManager, ptyPool, projectRegistry, branchCheckout, fileWatcher, getThemeType)
const diffProvider = new DiffProvider()

// ── Workspace modules ────────────────────────────────────────────────
const manifoldHome = path.join(app.getPath('home'), '.manifold')
const workspaceStore = new WorkspaceStore(path.join(manifoldHome, 'workspaces.json'))
const workspaceManager = new WorkspaceManager({
  store: workspaceStore,
  worktreeManager,
  projectRegistry,
  sessionManager,
  emitListChanged: () => { mainWindow?.webContents.send('workspace:list-changed') },
})
// Heal workspaces saved before project removal cascaded into workspace membership.
workspaceManager.pruneMissingProjects()
// The sidebar shows workspaces and nothing else, so every registered repo must be
// in one. Wraps repos added before that rule existed.
workspaceManager.adoptOrphanProjects()
const prCreator = new PrCreator()
const viewStateStore = new ViewStateStore()
const shellTabStore = new ShellTabStore()
const gitOps = new GitOperationsManager()
const dockLayoutStore = new DockLayoutStore()
const searchViewStore = new SearchViewStore()
const dismissedAgents = new DismissedAgentsStore()
sessionManager.setDismissedAgents(dismissedAgents)
const chatStore = new ChatStore()
const chatAdapter = new ChatAdapter()
chatAdapter.setChatStore(chatStore)
sessionManager.setChatAdapter(chatAdapter)
sessionManager.setGitOps(gitOps)

const memoryStore = new MemoryStore()
const memoryCapture = new MemoryCapture(chatAdapter, memoryStore, (sid) => sessionManager.getSession(sid))
const memoryCompressor = new MemoryCompressor(memoryStore, settingsStore)
const memoryInjector = new MemoryInjector(memoryStore, settingsStore)
memoryCapture.setMemoryCompressor(memoryCompressor)
sessionManager.setMemoryCapture(memoryCapture)
sessionManager.setMemoryCompressor(memoryCompressor)
sessionManager.setMemoryInjector(memoryInjector)

const verdictStore = new VerdictStore()
const verdictRecorder = new VerdictRecorder({
  store: verdictStore,
  getAiSettings: () => settingsStore.getSettings().transcription ?? { provider: 'none' },
  getDiffStats: (wt, base) => diffProvider.getDiffStats(wt, base),
  isBranchMerged: (wt, base, branch) => gitOps.isBranchMerged(wt, base, branch),
  lookupPrUrl: (wt) => lookupWorktreePrUrl(wt),
  summarize: (middle, settings) => summarizeMiddle(middle, settings),
  resolveSessionUsage: async (ctx) => {
    // Chat-mode: drain the live accumulator. Interactive Claude: read the on-disk
    // transcript by the --session-id we spawned with. Codex: read local rollout JSONL.
    const live = sessionManager.takeLiveUsage(ctx.sessionId)
    if (hasSessionUsage(live)) return live
    if (ctx.runtime === 'claude') {
      return readClaudeTranscriptUsage({ claudeProjectsDir: claudeProjectsDir(), worktreePath: ctx.worktreePath, sessionId: ctx.sessionId })
    }
    if (ctx.runtime === 'codex') {
      return readCodexUsage({
        codexHomeDir: codexHomeDir(),
        worktreePath: ctx.worktreePath,
        sessionId: ctx.sessionId,
        codexThreadId: sessionManager.getInternalSession(ctx.sessionId)?.codexThreadId,
        createdAtMs: ctx.createdAtMs,
        terminatedAtMs: ctx.terminatedAtMs,
      })
    }
    return null
  },
  resolveSessionUsageSync: (ctx) => {
    // Synchronous mirror of resolveSessionUsage for the app-quit teardown path.
    const live = sessionManager.takeLiveUsage(ctx.sessionId)
    if (hasSessionUsage(live)) return live
    if (ctx.runtime === 'claude') {
      return readClaudeTranscriptUsageSync({ claudeProjectsDir: claudeProjectsDir(), worktreePath: ctx.worktreePath, sessionId: ctx.sessionId })
    }
    if (ctx.runtime === 'codex') {
      return readCodexUsageSync({
        codexHomeDir: codexHomeDir(),
        worktreePath: ctx.worktreePath,
        sessionId: ctx.sessionId,
        codexThreadId: sessionManager.getInternalSession(ctx.sessionId)?.codexThreadId,
        createdAtMs: ctx.createdAtMs,
        terminatedAtMs: ctx.terminatedAtMs,
      })
    }
    return null
  },
})
sessionManager.setVerdictRecorder(verdictRecorder)
fileWatcher.setVerdictRecorder(verdictRecorder)

function hasSessionUsage(usage: SessionUsage | null): usage is SessionUsage {
  if (!usage) return false
  const tokens = usage.tokenUsage
  return usage.turns > 0 ||
    tokens.inputTokens > 0 ||
    tokens.outputTokens > 0 ||
    tokens.cacheReadTokens > 0 ||
    tokens.cacheCreationTokens > 0
}

const agentNotifier = new AgentNotifier({
  getSettings: () => settingsStore.getSettings(),
  isWindowFocused: () => mainWindow?.isFocused() ?? false,
  resolveSession: (sessionId) => {
    const session = sessionManager.getInternalSession(sessionId)
    if (!session) return undefined
    return {
      displayName: session.displayName,
      taskDescription: session.taskDescription,
      branchName: session.branchName,
      projectId: session.projectId,
    }
  },
  revealSession: (projectId, sessionId) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('notification:open-session', { projectId, sessionId })
  },
})
sessionManager.setNotificationService(agentNotifier)
ipcMain.on('notifications:active-session', (_event, sessionId: unknown) => {
  agentNotifier.setActiveSessionId(typeof sessionId === 'string' ? sessionId : null)
})

const pluginManager = new PluginManager(settingsStore.getSettings().storagePath, settingsStore, sessionManager, gitOps, worktreeManager, projectRegistry, verdictStore)
pluginManager.scan()

const ipcDeps = {
  settingsStore,
  projectRegistry,
  sessionManager,
  fileWatcher,
  diffProvider,
  prCreator,
  viewStateStore,
  shellTabStore,
  gitOps,
  branchCheckout,
  dockLayoutStore,
  searchViewStore,
  dismissedAgents,
  chatAdapter,
  chatStore,
  memoryStore,
  workspaceManager,
  verdictStore,
  verdictRecorder,
  pluginManager,
  send: (channel: string, ...args: unknown[]) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args) },
}

function toggleKeepAwake(): void {
  const next = !settingsStore.getSettings().keepAwake
  settingsStore.updateSettings({ keepAwake: next })
  if (next) {
    powerManager.enable()
  } else {
    powerManager.disable()
  }
  if (mainWindow) {
    rebuildAppMenu(mainWindow, { keepAwake: next, onToggleKeepAwake: toggleKeepAwake })
  }
}

function doCreateWindow(): void {
  const win = createWindow({
    getSettings: () => settingsStore.getSettings(),
    wireMainWindow: (w) => {
      sessionManager.setMainWindow(w)
      fileWatcher.setMainWindow(w)
      pluginManager.setMainWindow(w)
    },
    ipcDeps,
    onToggleKeepAwake: toggleKeepAwake,
    crashDiagnostics,
  })
  mainWindow = win
  // Only null out if this is still the live window — a stale 'closed' from a
  // previous window (e.g. during a mode switch) must not clobber the new one.
  win.on('closed', () => { if (mainWindow === win) mainWindow = null })
}

const modeSwitcher = new ModeSwitcher({ settingsStore, sessionManager, projectRegistry, chatStore })
modeSwitcher.register(
  doCreateWindow,
  () => mainWindow,
  (win) => { mainWindow = win }
)

// Register the manifold-webview:// privileged scheme BEFORE app.whenReady().
registerWebviewSchemePrivileged()

// ── App lifecycle ────────────────────────────────────────────────────
registerAppLifecycle({
  settingsStore,
  powerManager,
  memoryStore,
  sessionManager,
  ptyPool,
  fileWatcher,
  chatStore,
  pluginManager,
  createWindow: doCreateWindow,
})
