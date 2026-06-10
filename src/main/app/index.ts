import { app, BrowserWindow, nativeTheme } from 'electron'
import type { AgentStatus } from '../../shared/types'
import { loadShellPath } from './shell-path'
import { configureDevProfilePaths } from './dev-profile'

loadShellPath()
configureDevProfilePaths(app)

// Remove env vars set by parent CLI agents so spawned agents don't detect
// themselves as nested sessions and refuse to start.
delete process.env.CLAUDECODE

import { SettingsStore } from '../store/settings-store'
import { ProjectRegistry } from '../store/project-registry'
import { WorktreeManager } from '../git/worktree-manager'
import { PtyPool } from '../agent/pty-pool'
import { SessionManager } from '../session/session-manager'
import { FileWatcher } from '../fs/file-watcher'
import { ChokidarTreeWatcher } from '../fs/tree-watcher'
import { DiffProvider } from '../git/diff-provider'
import { PrCreator } from '../git/pr-creator'
import { ViewStateStore } from '../store/view-state-store'
import { ShellTabStore } from '../store/shell-tab-store'
import { GitOperationsManager } from '../git/git-operations'
import { BranchCheckoutManager } from '../git/branch-checkout-manager'
import { DockLayoutStore } from '../store/dock-layout-store'
import { SearchViewStore } from '../store/search-view-store'
import { BackgroundAgentHost } from '../background-agent-host/background-agent-host'
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
import * as path from 'node:path'
import { WorkspaceStore } from '../workspace/workspace-store'
import { WorkspaceManager } from '../workspace/workspace-manager'
import { WatchRunStore } from '../watch/run-store'
import { VerdictStore } from '../store/verdict-store'
import { VerdictRecorder } from '../session/verdict-recorder'
import { summarizeMiddle } from '../store/prompt-summarizer'
import { PluginManager } from '../plugins/plugin-manager'
import { registerWebviewSchemePrivileged } from '../plugins/webview-protocol'

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
const prCreator = new PrCreator()
const viewStateStore = new ViewStateStore()
const shellTabStore = new ShellTabStore()
const gitOps = new GitOperationsManager()
const dockLayoutStore = new DockLayoutStore()
const searchViewStore = new SearchViewStore()
const watchRunStore = new WatchRunStore()
const backgroundAgentHost = new BackgroundAgentHost({
  settingsStore,
  projectRegistry,
  sessionManager,
  gitOps,
})
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
  summarize: (middle, settings) => summarizeMiddle(middle, settings),
})
sessionManager.setVerdictRecorder(verdictRecorder)
fileWatcher.setVerdictRecorder(verdictRecorder)

const pluginManager = new PluginManager(settingsStore.getSettings().storagePath, settingsStore, sessionManager, gitOps)
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
  backgroundAgentHost,
  chatAdapter,
  chatStore,
  memoryStore,
  workspaceManager,
  watchRunStore,
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
