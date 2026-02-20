import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

// Electron on macOS doesn't inherit the user's shell PATH.
// Resolve it once at startup by asking the login shell.
function loadShellPath(): void {
  if (process.platform !== 'darwin') return
  try {
    const shell = process.env.SHELL ?? '/bin/zsh'
    const output = execFileSync(shell, ['-l', '-i', '-c', 'echo $PATH'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    // Take the last non-empty line in case .zshrc printed anything before PATH
    const shellPath = output.split('\n').reverse().find((l) => l.trim().length > 0)?.trim()
    if (shellPath) process.env.PATH = shellPath
  } catch {
    // Fall back to whatever Electron provided
  }
}

loadShellPath()
import { SettingsStore } from './settings-store'
import { ProjectRegistry } from './project-registry'
import { WorktreeManager } from './worktree-manager'
import { PtyPool } from './pty-pool'
import { SessionManager } from './session-manager'
import { FileWatcher } from './file-watcher'
import { DiffProvider } from './diff-provider'
import { PrCreator } from './pr-creator'
import { ViewStateStore } from './view-state-store'
import { registerIpcHandlers } from './ipc-handlers'

let mainWindow: BrowserWindow | null = null

// ── Module instances ─────────────────────────────────────────────────
const settingsStore = new SettingsStore()
const projectRegistry = new ProjectRegistry()
const worktreeManager = new WorktreeManager(settingsStore.getSettings().storagePath)
const ptyPool = new PtyPool()
const sessionManager = new SessionManager(worktreeManager, ptyPool, projectRegistry)
const fileWatcher = new FileWatcher()
const diffProvider = new DiffProvider()
const prCreator = new PrCreator()
const viewStateStore = new ViewStateStore()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Manifold',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  wireModules(mainWindow)
  loadRenderer(mainWindow)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function wireModules(window: BrowserWindow): void {
  sessionManager.setMainWindow(window)
  fileWatcher.setMainWindow(window)

  registerIpcHandlers({
    settingsStore,
    projectRegistry,
    sessionManager,
    fileWatcher,
    diffProvider,
    prCreator,
    viewStateStore,
  })
}

function loadRenderer(window: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── App lifecycle ────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
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
