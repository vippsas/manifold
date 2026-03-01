import * as path from 'node:path'
import { BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { debugLog } from './debug-log'
import type { SettingsStore } from '../store/settings-store'
import type { SessionManager } from '../session/session-manager'
import type { ProjectRegistry } from '../store/project-registry'

interface ModeSwitcherDeps {
  settingsStore: SettingsStore
  sessionManager: SessionManager
  projectRegistry: ProjectRegistry
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
    const { settingsStore, sessionManager, projectRegistry } = this.deps

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
        // Only start a dev server + auto-open for simple-mode projects (web apps
        // created from simple view).  Developer-view projects (CLI tools,
        // libraries, etc.) have no dev server to show, so just switch to the
        // simple dashboard with app cards.
        const project = projectRegistry.getProject(projectId)
        const simpleProjectsBase = path.join(settingsStore.getSettings().storagePath, 'projects')
        const isSimpleProject = project?.path.startsWith(simpleProjectsBase)

        if (isSimpleProject) {
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
        } else {
          debugLog(`[switch-mode] dev→simple: non-web project, showing dashboard`)
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
