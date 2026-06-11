import { app, BrowserWindow } from 'electron'
import * as path from 'node:path'
import { startLocalRendererServer, type LocalRendererServer } from './local-renderer-server'
import { setupAutoUpdater } from './auto-updater'
import { flushDebugLogSync } from './debug-log'
import { installFrameSourceReferrer, installWebviewProtocol } from '../plugins/webview-protocol'
import { killInFlightAiGenerateChildren } from '../git/git-operations'
import type { SettingsStore } from '../store/settings-store'
import type { PowerManager } from './power-manager'
import type { MemoryStore } from '../memory/memory-store'
import type { SessionManager } from '../session/session-manager'
import type { PtyPool } from '../agent/pty-pool'
import type { FileWatcher } from '../fs/file-watcher'
import type { ChatStore } from '../store/chat-store'
import type { PluginManager } from '../plugins/plugin-manager'

export interface AppLifecycleDeps {
  settingsStore: SettingsStore
  powerManager: PowerManager
  memoryStore: MemoryStore
  sessionManager: SessionManager
  ptyPool: PtyPool
  fileWatcher: FileWatcher
  createWindow: () => void
  chatStore: ChatStore
  pluginManager: PluginManager
}

/**
 * Register Electron app lifecycle handlers: renderer server + window creation
 * on ready, re-create on activate, and cleanup on quit.
 */
export function registerAppLifecycle(deps: AppLifecycleDeps): void {
  const { settingsStore, powerManager, memoryStore, sessionManager, ptyPool, fileWatcher, createWindow, chatStore, pluginManager } = deps
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
    // Plugin webviews live on a custom scheme, so Chromium sends no Referer
    // when they embed a frameSources origin — YouTube rejects that (Error
    // 153). Re-attach the loopback renderer origin as the Referer.
    installFrameSourceReferrer(() => process.env.ELECTRON_RENDERER_URL ?? '')
    createWindow()
    setupAutoUpdater()

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
    // Kill any in-flight aiGenerate model subprocesses so they don't orphan.
    killInFlightAiGenerateChildren()
    // Kill the forked plugin-host utility process so it doesn't orphan on quit.
    pluginManager.dispose()
    // Durability-critical, synchronous teardown must run BEFORE the first await:
    // Electron does not await async before-quit listeners, so anything after the
    // first await may not execute before the process exits (e.g. the SQLite WAL
    // would never be checkpoint-closed and the power-save blocker would linger).
    memoryStore.close()
    powerManager.disable()
    // Best-effort async teardown; the OS reclaims these handles on exit anyway.
    await fileWatcher.unwatchAll()
    await localRendererServer?.close()
  })
}
