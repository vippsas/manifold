import { app, BrowserWindow } from 'electron'
import { loadShellPath } from './shell-path'

loadShellPath()

// Remove env vars set by parent CLI agents so spawned agents don't detect
// themselves as nested sessions and refuse to start.
delete process.env.CLAUDECODE

import { SettingsStore } from '../store/settings-store'
import { ProjectRegistry } from '../store/project-registry'
import { WorktreeManager } from '../git/worktree-manager'
import { PtyPool } from '../agent/pty-pool'
import { SessionManager } from '../session/session-manager'
import { FileWatcher } from '../fs/file-watcher'
import { DiffProvider } from '../git/diff-provider'
import { PrCreator } from '../git/pr-creator'
import { ViewStateStore } from '../store/view-state-store'
import { ShellTabStore } from '../store/shell-tab-store'
import { GitOperationsManager } from '../git/git-operations'
import { BranchCheckoutManager } from '../git/branch-checkout-manager'
import { DockLayoutStore } from '../store/dock-layout-store'
import { ChatAdapter } from '../agent/chat-adapter'
import { DeploymentManager } from './deployment-manager'
import { setupAutoUpdater } from './auto-updater'
import { ModeSwitcher } from './mode-switcher'
import { createWindow } from './window-factory'

let mainWindow: BrowserWindow | null = null

// ── Module instances ─────────────────────────────────────────────────
const settingsStore = new SettingsStore()
const projectRegistry = new ProjectRegistry()
const worktreeManager = new WorktreeManager(settingsStore.getSettings().storagePath)
const branchCheckout = new BranchCheckoutManager(settingsStore.getSettings().storagePath)
const ptyPool = new PtyPool()
const fileWatcher = new FileWatcher()
const sessionManager = new SessionManager(worktreeManager, ptyPool, projectRegistry, branchCheckout, fileWatcher)
const diffProvider = new DiffProvider()
const prCreator = new PrCreator()
const viewStateStore = new ViewStateStore()
const shellTabStore = new ShellTabStore()
const gitOps = new GitOperationsManager()
const dockLayoutStore = new DockLayoutStore()
const chatAdapter = new ChatAdapter()
const deploymentManager = new DeploymentManager()
sessionManager.setChatAdapter(chatAdapter)

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
  chatAdapter,
  deploymentManager,
}

function doCreateWindow(): void {
  const win = createWindow({
    getSettings: () => settingsStore.getSettings(),
    wireMainWindow: (w) => {
      sessionManager.setMainWindow(w)
      fileWatcher.setMainWindow(w)
    },
    ipcDeps,
  })
  mainWindow = win
  win.on('closed', () => { mainWindow = null })
}

const modeSwitcher = new ModeSwitcher({ settingsStore, sessionManager })
modeSwitcher.register(
  doCreateWindow,
  () => mainWindow,
  (win) => { mainWindow = win }
)

// ── App lifecycle ────────────────────────────────────────────────────
app.whenReady().then(() => {
  doCreateWindow()
  if (mainWindow) {
    setupAutoUpdater(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      doCreateWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  // Kill all active sessions and clean up
  sessionManager.killAllSessions()
  ptyPool.killAll()
  await fileWatcher.unwatchAll()
})
