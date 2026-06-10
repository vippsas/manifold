import { BrowserWindow, ipcMain } from 'electron'
import type { IpcDependencies } from './types'
import { runWatchPlaylist } from '../watch/playlist-runner'
import type { WatchPlaylistEntryInput } from '../../shared/watch-types'
import { detectWatchSetup, clearWatchSetupCache } from '../watch/setup-detector'
import { installWatchSkills } from '../watch/skill-installer'
import { getBundledWatchSkillPath } from '../watch/resource-path'
import { ensureBinaries } from '../watch/binary-installer'
import { ensureYtDlp } from '../watch/yt-dlp-fetcher'
import { readFrameAsDataUrl } from '../watch/frame-reader'
import { peekVideo, peekPlaylist } from '../watch/peek'

export function registerWatchHandlers(deps: IpcDependencies): void {
  const { sessionManager, settingsStore, watchRunStore } = deps

  ipcMain.handle('watch:setup-status', () => {
    return detectWatchSetup({
      getTranscription: () => settingsStore.getSettings().transcription,
    })
  })

  ipcMain.handle('watch:install-skills', () => {
    clearWatchSetupCache()
    return installWatchSkills({ sourceDir: getBundledWatchSkillPath() })
  })

  ipcMain.handle('watch:read-frame', (_event, framePath: string) => {
    return readFrameAsDataUrl(framePath)
  })

  ipcMain.handle('watch:peek', (_event, url: string) => {
    return peekVideo(url)
  })

  ipcMain.handle('watch:peek-playlist', (_event, url: string) => {
    return peekPlaylist(url)
  })

  ipcMain.handle('watch:state-get', (_event, sessionId: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    return watchRunStore.getSnapshot(session, (id) => sessionManager.hasSession(id))
  })

  ipcMain.handle('watch:state-set-url', (_event, sessionId: string, url: string) => {
    const session = sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    return watchRunStore.setUrl(session, url)
  })

  ipcMain.handle('watch:run-playlist', async (event, sessionId: string, entries: WatchPlaylistEntryInput[], sourceUrl?: string) => {
    const sender = event.sender
    const win = BrowserWindow.fromWebContents(sender)
    const ctrl = new AbortController()
    const onClose = (): void => ctrl.abort()
    win?.once('closed', onClose)
    const emit = (index: number, kind: 'log' | 'stage', payload: string): void => {
      if (win && !win.isDestroyed()) {
        sender.send('watch:playlist-progress', { sessionId, entryIndex: index, kind, payload })
      }
    }
    try {
      return await runWatchPlaylist(
        {
          sessionManager,
          watchRunStore,
          getTranscription: () => settingsStore.getSettings().transcription ?? { provider: 'none' },
        },
        {
          sessionId,
          entries,
          sourceUrl,
          signal: ctrl.signal,
          hooks: (i) => ({
            onLog: (line) => emit(i, 'log', line),
            onStage: (stage) => emit(i, 'stage', stage),
          }),
          onEntryFramesReady: (i, frames) => {
            if (win && !win.isDestroyed()) {
              sender.send('watch:playlist-progress', { sessionId, entryIndex: i, kind: 'frames', payload: frames })
            }
          },
          onEntrySpawned: (i, siblingSessionId) => {
            if (win && !win.isDestroyed()) {
              sender.send('watch:playlist-progress', { sessionId, entryIndex: i, kind: 'sibling', payload: siblingSessionId })
            }
          },
        },
      )
    } finally {
      win?.off('closed', onClose)
    }
  })

  ipcMain.handle('watch:install-binaries', async (event) => {
    const sender = event.sender
    const win = BrowserWindow.fromWebContents(sender)
    const emit = (line: string): void => {
      if (win && !win.isDestroyed()) {
        sender.send('watch:install-progress', { line })
      }
    }
    clearWatchSetupCache()
    const result = await ensureBinaries(['ffmpeg'], { onLog: emit })
    try {
      await ensureYtDlp({ onLog: emit })
      result.installed.push('yt-dlp')
    } catch (err) {
      result.errors.push({
        binary: 'yt-dlp',
        message: err instanceof Error ? err.message : String(err),
      })
    }
    clearWatchSetupCache()
    return result
  })
}
