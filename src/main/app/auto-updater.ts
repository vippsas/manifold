import { BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { debugLog } from './debug-log'

export function setupAutoUpdater(window: BrowserWindow): void {
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
