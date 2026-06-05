import { app, BrowserWindow } from 'electron'
import * as path from 'node:path'
import { startLocalRendererServer, type LocalRendererServer } from './local-renderer-server'
import { setupAutoUpdater } from './auto-updater'
import { flushDebugLogSync } from './debug-log'
import { installWatchSkills } from '../watch/skill-installer'
import { getBundledWatchSkillPath } from '../watch/resource-path'
import { installWebviewProtocol } from '../plugins/webview-protocol'
import type { SettingsStore } from '../store/settings-store'
import type { PowerManager } from './power-manager'
import type { MemoryStore } from '../memory/memory-store'
import type { SessionManager } from '../session/session-manager'
import type { PtyPool } from '../agent/pty-pool'
import type { FileWatcher } from '../fs/file-watcher'
import type { ChatStore } from '../store/chat-store'

export interface AppLifecycleDeps {
  settingsStore: SettingsStore
  powerManager: PowerManager
  memoryStore: MemoryStore
  sessionManager: SessionManager
  ptyPool: PtyPool
  fileWatcher: FileWatcher
  createWindow: () => void
  chatStore: ChatStore
}

/**
 * Register Electron app lifecycle handlers: renderer server + window creation
 * on ready, re-create on activate, and cleanup on quit.
 */
export function registerAppLifecycle(deps: AppLifecycleDeps): void {
  const { settingsStore, powerManager, memoryStore, sessionManager, ptyPool, fileWatcher, createWindow, chatStore } = deps
  let localRendererServer: LocalRendererServer | null = null

  void app.whenReady().then(async () => {
    // Production-only: serve the renderer over http://127.0.0.1 instead of
    // file://. Embed providers (YouTube, Vimeo, Twitter, …) reject parents
    // whose serialized origin is `null`/`file://`, surfacing as e.g. YouTube
    // "Error 152". A loopback HTTP origin replicates the dev environment.
    if (!process.env.ELECTRON_RENDERER_URL) {
      try {
        localRendererServer = await startLocalRendererServer(path.join(__dirname, '..'))
        process.env.ELECTRON_RENDERER_URL = localRendererServer.url
      } catch (err) {
        console.error('[renderer] failed to start local server, falling back to file://:', err)
      }
    }
    if (settingsStore.getSettings().keepAwake) {
      powerManager.enable()
    }
    installWebviewProtocol()
    createWindow()
    setupAutoUpdater()

    try {
      const result = installWatchSkills({ sourceDir: getBundledWatchSkillPath() })
      if (result.errors.length > 0) {
        console.warn('[watch] skill install errors:', result.errors)
      }
    } catch (err) {
      console.warn('[watch] skill install failed:', err)
    }

    try {
      const settings = settingsStore.getSettings()
      memoryStore.pruneAll(settings.memory?.rawRetentionDays ?? 30)
    } catch {
      // Best-effort pruning
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
    // Persist any pending (debounced) chat writes before tearing down.
    chatStore.flushSync()
    // Persist any buffered debug-log lines before exit.
    flushDebugLogSync()
    // Kill all active sessions and clean up
    sessionManager.killAllSessions()
    ptyPool.killAll()
    await fileWatcher.unwatchAll()
    await localRendererServer?.close()
    memoryStore.close()
    powerManager.disable()
  })
}
