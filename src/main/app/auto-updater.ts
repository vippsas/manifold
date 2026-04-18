import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { autoUpdater } from 'electron-updater'
import { DEBUG_LOG, debugLog } from './debug-log'

const HOURLY_UPDATE_CHECK_MS = 60 * 60 * 1000
const RETRY_UPDATE_CHECK_DELAYS_MS = [5_000, 15_000, 60_000] as const
const UPDATE_LOG_LINE_LIMIT = 80
const FORCE_DEV_UPDATES = process.env.MANIFOLD_FORCE_DEV_UPDATES === '1'

let updaterInitialized = false
let updateCheckInFlight = false
let updateRetryAttempt = 0
let pendingUpdateRetryTimer: ReturnType<typeof setTimeout> | null = null

function shouldRunAutoUpdater(): boolean {
  return app.isPackaged || FORCE_DEV_UPDATES
}

function finishUpdateCheck(): void {
  updateCheckInFlight = false
}

function clearScheduledRetry(): void {
  if (pendingUpdateRetryTimer === null) return
  clearTimeout(pendingUpdateRetryTimer)
  pendingUpdateRetryTimer = null
}

function resetRetryState(): void {
  updateRetryAttempt = 0
  clearScheduledRetry()
}

function shouldRetryUpdateCheck(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /\b5\d{2}\b/.test(message)
    || /ERR_TIMED_OUT/.test(message)
    || /Cannot find latest-mac\.yml/i.test(message)
}

function scheduleRetry(): void {
  if (updateRetryAttempt >= RETRY_UPDATE_CHECK_DELAYS_MS.length) {
    debugLog('[updater] exhausted retry attempts after transient failure')
    return
  }

  const delay = RETRY_UPDATE_CHECK_DELAYS_MS[updateRetryAttempt]
  const attempt = updateRetryAttempt + 1
  updateRetryAttempt += 1
  clearScheduledRetry()
  debugLog(`[updater] scheduling retry ${attempt}/${RETRY_UPDATE_CHECK_DELAYS_MS.length} in ${delay}ms`)
  pendingUpdateRetryTimer = setTimeout(() => {
    pendingUpdateRetryTimer = null
    void checkForUpdates('retry')
  }, delay)
}

function broadcastStatus(status: 'available' | 'downloaded', version: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue
    window.webContents.send('updater:status', { status, version })
  }
}

function readUpdaterLogExcerpt(): string {
  try {
    const contents = readFileSync(DEBUG_LOG, 'utf8')
    const lines = contents
      .split(/\r?\n/)
      .filter((line) => line.includes('[updater]') && !line.includes('skipping update checks in dev because the app is not packaged'))
      .slice(-UPDATE_LOG_LINE_LIMIT)

    if (lines.length === 0) {
      return 'No updater log entries have been recorded yet.'
    }

    return lines.join('\n')
  } catch {
    return 'Update log is not available yet.'
  }
}

export function getUpdateLogExcerpt(): string {
  return readUpdaterLogExcerpt()
}

export function clearUpdateLog(): void {
  try {
    const contents = readFileSync(DEBUG_LOG, 'utf8')
    const retainedLines = contents
      .split(/\r?\n/)
      .filter((line) => line.length > 0 && !line.includes('[updater]'))

    writeFileSync(DEBUG_LOG, retainedLines.length > 0 ? `${retainedLines.join('\n')}\n` : '', 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return
    throw error
  }
}

export async function checkForUpdates(reason: 'startup' | 'scheduled' | 'manual' | 'retry' = 'manual'): Promise<void> {
  if (updateCheckInFlight) {
    debugLog(`[updater] skipping ${reason} check; updater is busy`)
    return
  }

  if (reason !== 'retry') {
    clearScheduledRetry()
  }

  updateCheckInFlight = true
  debugLog(`[updater] triggering ${reason} update check`)

  try {
    await autoUpdater.checkForUpdatesAndNotify()
  } catch (error) {
    finishUpdateCheck()
    const message = error instanceof Error ? error.message : String(error)
    debugLog(`[updater] check failed: ${message}`)
    if (shouldRetryUpdateCheck(error)) {
      scheduleRetry()
    } else {
      resetRetryState()
    }
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
    resetRetryState()
    debugLog(`[updater] update available: ${info.version}`)
    broadcastStatus('available', info.version)
  })
  autoUpdater.on('update-not-available', () => {
    resetRetryState()
    debugLog('[updater] up to date')
    finishUpdateCheck()
  })
  autoUpdater.on('download-progress', (progress) => {
    debugLog(`[updater] downloading: ${Math.round(progress.percent)}%`)
  })
  autoUpdater.on('update-downloaded', (info) => {
    resetRetryState()
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
