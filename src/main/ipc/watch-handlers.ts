import { BrowserWindow, ipcMain } from 'electron'
import type { IpcDependencies } from './types'
import { runWatch } from '../watch/runner'
import { detectWatchSetup, clearWatchSetupCache } from '../watch/setup-detector'
import { installWatchSkills } from '../watch/skill-installer'
import { getBundledWatchSkillPath } from '../watch/resource-path'
import { ensureBinaries } from '../watch/binary-installer'
import { readFrameAsDataUrl } from '../watch/frame-reader'

export function registerWatchHandlers(deps: IpcDependencies): void {
  const { sessionManager, settingsStore } = deps

  ipcMain.handle('watch:run', async (event, sessionId: string, source: string, question?: string) => {
    const sender = event.sender
    const win = BrowserWindow.fromWebContents(sender)
    const emit = (line: string): void => {
      if (win && !win.isDestroyed()) {
        sender.send('watch:progress', { sessionId, kind: 'log', line })
      }
    }
    const emitStage = (stage: string): void => {
      if (win && !win.isDestroyed()) {
        sender.send('watch:progress', { sessionId, kind: 'stage', stage })
      }
    }

    return runWatch(
      {
        sessionManager,
        getTranscription: () => settingsStore.getSettings().transcription ?? { provider: 'none' },
      },
      {
        sessionId,
        source,
        question,
        hooks: { onLog: emit, onStage: emitStage },
      },
    )
  })

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

  ipcMain.handle('watch:install-binaries', async (event) => {
    const sender = event.sender
    const win = BrowserWindow.fromWebContents(sender)
    const emit = (line: string): void => {
      if (win && !win.isDestroyed()) {
        sender.send('watch:install-progress', { line })
      }
    }
    clearWatchSetupCache()
    return ensureBinaries(['ffmpeg', 'yt-dlp'], { onLog: emit })
  })
}
