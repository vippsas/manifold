import { BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { debugLog } from './debug-log'
import type { SettingsStore } from '../store/settings-store'
import type { SessionManager } from '../session/session-manager'

interface ModeSwitcherDeps {
  settingsStore: SettingsStore
  sessionManager: SessionManager
}

export class ModeSwitcher {
  private deps: ModeSwitcherDeps

  constructor(deps: ModeSwitcherDeps) {
    this.deps = deps
  }

  register(
    createWindow: () => void,
    getMainWindow: () => BrowserWindow | null,
    setMainWindow: (win: BrowserWindow | null) => void
  ): void {
    this.registerThemeHandler(getMainWindow)
    this.registerModeSwitchHandler(createWindow, getMainWindow, setMainWindow)
  }

  private registerThemeHandler(getMainWindow: () => BrowserWindow | null): void {
    ipcMain.on('theme:changed', (_event, payload: { type: string; background: string }) => {
      nativeTheme.themeSource = (payload.type === 'light' ? 'light' : 'dark') as 'dark' | 'light'
      const win = getMainWindow()
      if (win) {
        win.setBackgroundColor(payload.background)
      }
    })
  }

  private registerModeSwitchHandler(
    createWindow: () => void,
    getMainWindow: () => BrowserWindow | null,
    setMainWindow: (win: BrowserWindow | null) => void
  ): void {
    const { settingsStore, sessionManager } = this.deps

    ipcMain.handle('app:switch-mode', async (_event, mode: 'developer' | 'simple', projectId?: string, sessionId?: string) => {
      settingsStore.updateSettings({ uiMode: mode })

      let branchName: string | undefined
      let simpleAppPayload: Record<string, unknown> | undefined

      if (mode === 'developer' && projectId) {
        const result = await sessionManager.killNonInteractiveSessions(projectId)
        branchName = result.branchName
        if (result.killedIds.length > 0) {
          debugLog(`[switch-mode] killed ${result.killedIds.length} non-interactive session(s), branch: ${branchName}`)
        }
      }

      if (mode === 'simple' && projectId && sessionId) {
        try {
          const result = await sessionManager.killInteractiveSession(sessionId)
          const { sessionId: newSessionId } = await sessionManager.startDevServerSession(
            projectId,
            result.branchName,
            result.taskDescription
          )
          simpleAppPayload = {
            sessionId: newSessionId,
            projectId,
            name: result.branchName.replace('manifold/', ''),
            description: result.taskDescription ?? '',
            status: 'building',
            previewUrl: null,
            liveUrl: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
          debugLog(`[switch-mode] dev→simple: killed session ${sessionId}, new session ${newSessionId}`)
        } catch (err) {
          debugLog(`[switch-mode] dev→simple failed: ${err}`)
        }
      }

      const currentWin = getMainWindow()
      if (currentWin) {
        currentWin.destroy()
        setMainWindow(null)
      }
      createWindow()

      const newWindow = getMainWindow()
      if (mode === 'developer' && projectId && newWindow) {
        newWindow.webContents.once('did-finish-load', () => {
          newWindow.webContents.send('app:auto-spawn', projectId, branchName)
        })
      }

      if (mode === 'simple' && simpleAppPayload && newWindow) {
        newWindow.webContents.once('did-finish-load', () => {
          newWindow.webContents.send('app:auto-open-app', simpleAppPayload)
        })
      }
    })
  }
}
