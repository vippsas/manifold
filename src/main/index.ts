import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
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
const shellTabStore = new ShellTabStore()
const gitOps = new GitOperationsManager()

// Resolve background color for the stored theme setting.
// The renderer sends the actual background after loading the theme adapter,
// but we need a reasonable initial value before the renderer is ready.
function resolveInitialBackground(theme: string): string {
  if (theme === 'light' || theme === 'vs') return '#ffffff'
  return '#282a36' // Dracula-ish default for dark themes
}

function resolveThemeType(theme: string): 'dark' | 'light' {
  if (theme === 'light' || theme === 'vs') return 'light'
  return 'dark'
}

function createWindow(): void {
  const theme = settingsStore.getSettings().theme ?? 'dracula'
  nativeTheme.themeSource = resolveThemeType(theme)

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Manifold',
    backgroundColor: resolveInitialBackground(theme),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  wireModules(mainWindow)
  loadRenderer(mainWindow)

  // Open external links in the user's default browser instead of inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  // Update native title bar and window background when the user switches themes.
  // Renderer sends { type: 'dark'|'light', background: '#hex' } after applying theme.
  ipcMain.on('theme:changed', (_event, payload: { type: string; background: string }) => {
    nativeTheme.themeSource = (payload.type === 'light' ? 'light' : 'dark') as 'dark' | 'light'
    if (mainWindow) {
      mainWindow.setBackgroundColor(payload.background)
    }
  })

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
    shellTabStore,
    gitOps,
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
