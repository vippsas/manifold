import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { debugLog } from './debug-log'

// Electron on macOS doesn't inherit the user's shell PATH.
// Resolve it once at startup by asking the login shell.
// IMPORTANT: Do NOT source .zshrc here — it's for interactive shells and
// hangs/timeouts when launched from Spotlight with no TTY.
function loadShellPath(): void {
  if (process.platform !== 'darwin') return
  try {
    const shell = process.env.SHELL ?? '/bin/zsh'
    const output = execFileSync(shell, ['-l', '-c', 'echo $PATH'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    // Take the last non-empty line in case profile scripts printed anything
    const shellPath = output.split('\n').reverse().find((l) => l.trim().length > 0)?.trim()
    if (shellPath) {
      process.env.PATH = shellPath
      debugLog(`[startup] PATH resolved (${shellPath.split(':').length} entries), includes .local/bin: ${shellPath.includes('.local/bin')}`)
    } else {
      debugLog('[startup] loadShellPath: no PATH found in shell output')
    }
  } catch (err) {
    debugLog(`[startup] loadShellPath failed: ${err}`)
  }

  // Ensure well-known binary directories are in PATH even if shell resolution
  // was incomplete or failed (common when launched from Spotlight/Finder).
  const home = homedir()
  const commonDirs = [
    join(home, '.local', 'bin'),      // npm global installs (claude)
    '/opt/homebrew/bin',               // Homebrew ARM (codex, git, node)
    '/opt/homebrew/sbin',              // Homebrew system tools
    '/usr/local/bin',                  // Homebrew Intel / system tools
  ]
  const currentPath = process.env.PATH ?? ''
  const pathSet = new Set(currentPath.split(':'))
  const missing = commonDirs.filter(d => !pathSet.has(d))
  if (missing.length > 0) {
    process.env.PATH = currentPath + ':' + missing.join(':')
    debugLog(`[startup] appended ${missing.length} common dirs to PATH: ${missing.join(', ')}`)
  }
}

loadShellPath()

// Remove env vars set by parent CLI agents so spawned agents don't detect
// themselves as nested sessions and refuse to start.
delete process.env.CLAUDECODE

import { SettingsStore } from './settings-store'
import { ProjectRegistry } from './project-registry'
import { WorktreeManager } from './worktree-manager'
import { PtyPool } from './pty-pool'
import { SessionManager } from './session-manager'
import { FileWatcher } from './file-watcher'
import { DiffProvider } from './diff-provider'
import { PrCreator } from './pr-creator'
import { ViewStateStore } from './view-state-store'
import { ShellTabStore } from './shell-tab-store'
import { GitOperationsManager } from './git-operations'
import { BranchCheckoutManager } from './branch-checkout-manager'
import { DockLayoutStore } from './dock-layout-store'
import { ChatAdapter } from './chat-adapter'
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
