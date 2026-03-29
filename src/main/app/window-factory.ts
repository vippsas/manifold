import { BrowserWindow, Menu, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { debugLog } from './debug-log'
import { buildAppMenu } from './app-menu'
import { registerIpcHandlers, type IpcDependencies } from './ipc-handlers'

// Suppress Electron's internal GUEST_VIEW_MANAGER_CALL error logging for
// ERR_ABORTED (-3).  These fire when a <webview> navigation is cancelled
// (e.g. during dev-server restarts, HMR, or startup race conditions).
// Electron logs them via console.error inside its ipcMain.handle plumbing
// before the rejection reaches process-level handlers, so we intercept here.
const _origConsoleError = console.error
console.error = (...args: unknown[]): void => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('GUEST_VIEW_MANAGER_CALL') &&
    args[1] instanceof Error &&
    (args[1] as NodeJS.ErrnoException).errno === -3
  ) {
    return
  }
  _origConsoleError.apply(console, args)
}

function resolveInitialBackground(theme: string): string {
  if (theme === 'light' || theme === 'vs') return '#ffffff'
  return '#282a36' // Dracula-ish default for dark themes
}

function resolveThemeType(theme: string): 'dark' | 'light' {
  if (theme === 'light' || theme === 'vs') return 'light'
  return 'dark'
}

interface WindowFactoryDeps {
  getSettings: () => { theme?: string; uiMode?: string }
  wireMainWindow: (win: BrowserWindow) => void
  ipcDeps: IpcDependencies
}

let ipcHandlersRegistered = false

export function createWindow(deps: WindowFactoryDeps): BrowserWindow {
  const settings = deps.getSettings()
  const theme = settings.theme ?? 'dracula'
  const simple = settings.uiMode === 'simple'
  nativeTheme.themeSource = resolveThemeType(theme)

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Manifold',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: resolveInitialBackground(theme),
    webPreferences: {
      preload: join(__dirname, simple ? '../preload/simple.js' : '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
    },
  })

  // Validate webview creation: strip preload, force isolation, restrict to localhost.
  win.webContents.on('will-attach-webview', (_event, webPreferences, params) => {
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
  win.webContents.on('did-attach-webview', (_event, webContents) => {
    webContents.on('did-fail-load', (failEvent, errorCode) => {
      if (errorCode === -3) {
        failEvent.preventDefault()
      }
    })
  })

  deps.wireMainWindow(win)

  if (!ipcHandlersRegistered) {
    registerIpcHandlers(deps.ipcDeps)
    ipcHandlersRegistered = true
  }

  loadRenderer(win, simple)

  // Open external links in the user's default browser instead of inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  win.webContents.on('render-process-gone', (_event, details) => {
    debugLog(`[renderer] process gone: reason=${details.reason} exitCode=${details.exitCode}`)
  })

  Menu.setApplicationMenu(buildAppMenu(win))

  return win
}

function loadRenderer(window: BrowserWindow, simple: boolean): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    const base = process.env.ELECTRON_RENDERER_URL
    const page = simple ? '/renderer-simple/index.html' : '/renderer/index.html'
    window.loadURL(base + page)
  } else {
    const page = simple ? '../renderer-simple/index.html' : '../renderer/index.html'
    window.loadFile(join(__dirname, page))
  }
}
