import { app, BrowserWindow, ipcMain, Menu, nativeTheme, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
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
import { registerIpcHandlers } from './ipc-handlers'

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
      webviewTag: true,
      sandbox: false
    }
  })

  // Validate webview creation: strip preload, force isolation, restrict to localhost.
  mainWindow.webContents.on('will-attach-webview', (_event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true

    const url = params.src || ''
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/.test(url)
    if (!isLocalhost) {
      _event.preventDefault()
    }
  })

  // Suppress ERR_ABORTED (-3) from webview when dev server restarts or shuts down.
  mainWindow.webContents.on('did-attach-webview', (_event, webContents) => {
    webContents.on('did-fail-load', (failEvent, errorCode) => {
      if (errorCode === -3) {
        failEvent.preventDefault()
      }
    })
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

  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Manifold',
      submenu: [
        {
          label: 'About Manifold',
          click: () => mainWindow?.webContents.send('show-about'),
        },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow?.webContents.send('show-settings'),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Projects',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'projects'),
        },
        {
          label: 'Toggle Agent',
          accelerator: 'CmdOrCtrl+2',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'agent'),
        },
        {
          label: 'Toggle Editor',
          accelerator: 'CmdOrCtrl+3',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'editor'),
        },
        {
          label: 'Toggle Files',
          accelerator: 'CmdOrCtrl+4',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'fileTree'),
        },
        {
          label: 'Toggle Modified Files',
          accelerator: 'CmdOrCtrl+5',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'modifiedFiles'),
        },
        {
          label: 'Toggle Shell',
          accelerator: 'CmdOrCtrl+6',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'shell'),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))
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
    branchCheckout,
    dockLayoutStore,
  })
}

function loadRenderer(window: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── Auto-updater ─────────────────────────────────────────────────────
function setupAutoUpdater(window: BrowserWindow): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    debugLog('[updater] checking for update…')
  })
  autoUpdater.on('update-available', (info) => {
    debugLog(`[updater] update available: ${info.version}`)
    window.webContents.send('updater:status', { status: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    debugLog('[updater] up to date')
  })
  autoUpdater.on('download-progress', (progress) => {
    debugLog(`[updater] downloading: ${Math.round(progress.percent)}%`)
  })
  autoUpdater.on('update-downloaded', (info) => {
    debugLog(`[updater] downloaded: ${info.version}`)
    window.webContents.send('updater:status', { status: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err) => {
    debugLog(`[updater] error: ${err.message}`)
  })

  autoUpdater.checkForUpdatesAndNotify()
}

// ── App lifecycle ────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  if (mainWindow) {
    setupAutoUpdater(mainWindow)
  }

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
