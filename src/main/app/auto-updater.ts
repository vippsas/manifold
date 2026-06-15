import { app, BrowserWindow, shell } from 'electron'
import { openSync, closeSync, readSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { autoUpdater } from 'electron-updater'
import { DEBUG_LOG, debugLog } from './debug-log'
import type { ReleaseNotes } from '../../shared/types'

const HOURLY_UPDATE_CHECK_MS = 60 * 60 * 1000
const RETRY_UPDATE_CHECK_DELAYS_MS = [5_000, 15_000, 60_000] as const
const UPDATE_LOG_LINE_LIMIT = 80
// Read at most ~256 KB from the tail of debug.log to avoid blocking the main thread
// when the file is large (issue #501).
const DEBUG_LOG_TAIL_BYTES = 256 * 1024
const FORCE_DEV_UPDATES = process.env.MANIFOLD_FORCE_DEV_UPDATES === '1'
const RELEASE_NOTES_API_BASE = 'https://api.github.com/repos/vippsas/manifold/releases'
const RELEASE_NOTES_WEB_BASE = 'https://github.com/vippsas/manifold/releases'

let updaterInitialized = false
let updateCheckInFlight = false
let updateRetryAttempt = 0
let pendingUpdateRetryTimer: ReturnType<typeof setTimeout> | null = null
const releaseNotesCache = new Map<string, ReleaseNotes>()

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

function readLogTail(path: string, maxBytes: number): string {
  const fd = openSync(path, 'r')
  try {
    const { size } = statSync(path)
    const readSize = Math.min(size, maxBytes)
    const offset = size - readSize
    const buf = Buffer.allocUnsafe(readSize)
    const bytesRead = readSync(fd, buf, 0, readSize, offset)
    return buf.slice(0, bytesRead).toString('utf8')
  } finally {
    closeSync(fd)
  }
}

function readUpdaterLogExcerpt(): string {
  try {
    const tail = readLogTail(DEBUG_LOG, DEBUG_LOG_TAIL_BYTES)
    // When reading from the tail the first line may be a partial line; drop it if the
    // tail didn't start at offset 0 (heuristic: no newline at the beginning).
    const lines = tail
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

function normalizeVersion(version: string): string {
  return version.replace(/^v/i, '')
}

function buildReleaseNotesUrl(version: string): string {
  return `${RELEASE_NOTES_WEB_BASE}/tag/v${normalizeVersion(version)}`
}

function buildFallbackReleaseNotes(version: string, message?: string): ReleaseNotes {
  const normalizedVersion = normalizeVersion(version)
  const details = message ? `\n\n${message}` : ''
  return {
    version: normalizedVersion,
    name: `Manifold v${normalizedVersion}`,
    body: `# Manifold v${normalizedVersion}\n\nRelease notes are not available in-app right now.${details}\n\nUse **Open on GitHub** for the full release page.`,
    url: buildReleaseNotesUrl(normalizedVersion),
    publishedAt: null,
    source: 'fallback',
  }
}

export async function getReleaseNotes(version = app.getVersion()): Promise<ReleaseNotes> {
  const normalizedVersion = normalizeVersion(version)
  const cached = releaseNotesCache.get(normalizedVersion)
  if (cached) return cached

  try {
    const response = await fetch(`${RELEASE_NOTES_API_BASE}/tags/v${normalizedVersion}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Manifold Desktop',
      },
    })

    if (!response.ok) {
      // Don't cache transient failures — a later retry should fetch real notes (#507).
      return buildFallbackReleaseNotes(normalizedVersion, `GitHub returned ${response.status}.`)
    }

    const payload = await response.json() as {
      tag_name?: string
      name?: string
      body?: string
      html_url?: string
      published_at?: string
    }

    const notes: ReleaseNotes = {
      version: normalizeVersion(payload.tag_name ?? normalizedVersion),
      name: payload.name?.trim() || `Manifold v${normalizedVersion}`,
      body: payload.body?.trim() || `# Manifold v${normalizedVersion}\n\nNo release notes were provided for this version yet.`,
      url: payload.html_url || buildReleaseNotesUrl(normalizedVersion),
      publishedAt: payload.published_at ?? null,
      source: 'github',
    }
    releaseNotesCache.set(normalizedVersion, notes)
    return notes
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Don't cache network/transient errors — a later retry should fetch real notes (#507).
    return buildFallbackReleaseNotes(normalizedVersion, `Failed to load release notes: ${message}`)
  }
}

export async function openReleaseNotesExternal(version = app.getVersion()): Promise<void> {
  await shell.openExternal(buildReleaseNotesUrl(version))
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
    // checkForUpdates (not checkForUpdatesAndNotify): electron-updater's notifying
    // variant fires a native OS "update ready" notification on every check where an
    // update is available, so the hourly checks spammed a fresh macOS notification for
    // the same already-downloaded version until the app was restarted. We surface the
    // update through our own dismissible in-app banner via the updater:status broadcast.
    const result = await autoUpdater.checkForUpdates()
    // null means the updater is not active (e.g. dev / unpackaged build).
    // In that case none of the autoUpdater events fire, so we must reset the
    // flag here to prevent every subsequent check from being silently skipped (#508).
    if (result === null) {
      finishUpdateCheck()
    }
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
