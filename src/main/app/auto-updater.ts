import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { debugLog } from './debug-log'

const HOURLY_UPDATE_CHECK_MS = 60 * 60 * 1000
const FORCE_DEV_UPDATES = process.env.MANIFOLD_FORCE_DEV_UPDATES === '1'

let updaterInitialized = false
let updateCheckInFlight = false

function shouldRunAutoUpdater(): boolean {
  return app.isPackaged || FORCE_DEV_UPDATES
}

function finishUpdateCheck(): void {
  updateCheckInFlight = false
}

function broadcastStatus(status: 'available' | 'downloaded', version: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue
    window.webContents.send('updater:status', { status, version })
  }
}

export async function checkForUpdates(reason: 'startup' | 'scheduled' | 'manual' = 'manual'): Promise<void> {
  if (updateCheckInFlight) {
    debugLog(`[updater] skipping ${reason} check; updater is busy`)
    return
  }

  updateCheckInFlight = true
  debugLog(`[updater] triggering ${reason} update check`)

  try {
    await autoUpdater.checkForUpdatesAndNotify()
  } catch (error) {
    finishUpdateCheck()
    const message = error instanceof Error ? error.message : String(error)
    debugLog(`[updater] check failed: ${message}`)
  }
}

export function setupAutoUpdater(): void {
  if (updaterInitialized) return
  updaterInitialized = true

  if (!shouldRunAutoUpdater()) {
    debugLog('[updater] skipping update checks in dev because the app is not packaged')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    debugLog('[updater] checking for update…')
  })
  autoUpdater.on('update-available', (info) => {
    debugLog(`[updater] update available: ${info.version}`)
    broadcastStatus('available', info.version)
  })
  autoUpdater.on('update-not-available', () => {
    debugLog('[updater] up to date')
    finishUpdateCheck()
  })
  autoUpdater.on('download-progress', (progress) => {
    debugLog(`[updater] downloading: ${Math.round(progress.percent)}%`)
  })
  autoUpdater.on('update-downloaded', (info) => {
    debugLog(`[updater] downloaded: ${info.version}`)
    finishUpdateCheck()
    broadcastStatus('downloaded', info.version)
  })
  autoUpdater.on('error', (err) => {
    finishUpdateCheck()
    debugLog(`[updater] error: ${err.message}`)
  })

  void checkForUpdates('startup')
  setInterval(() => {
    void checkForUpdates('scheduled')
  }, HOURLY_UPDATE_CHECK_MS)
}
