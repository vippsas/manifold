import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { BrowserWindow } from 'electron'

const mocks = vi.hoisted(() => {
  const updaterHandlers = new Map<string, (...args: unknown[]) => void>()
  const mockGetAllWindows = vi.fn()
  const mockCheckForUpdates = vi.fn()
  const mockCheckForUpdatesAndNotify = vi.fn()
  const mockReadFileSync = vi.fn()
  const mockWriteFileSync = vi.fn()
  const mockOpenExternal = vi.fn()
  const debugLog = vi.fn()
  const mockApp = {
    isPackaged: true,
    getVersion: vi.fn(() => '0.2.17'),
  }
  const autoUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      updaterHandlers.set(event, handler)
      return autoUpdater
    }),
    checkForUpdates: mockCheckForUpdates,
    checkForUpdatesAndNotify: mockCheckForUpdatesAndNotify,
  }

  // Tail-read mocks: simulate reading a file via fd-based API.
  let _tailContent = ''
  const mockOpenSync = vi.fn(() => 99)
  const mockCloseSync = vi.fn()
  const mockStatSync = vi.fn(() => ({ size: Buffer.byteLength(_tailContent, 'utf8') }))
  const mockReadSync = vi.fn((_fd: number, buf: Buffer, _offset: number, length: number, position: number) => {
    const content = Buffer.from(_tailContent, 'utf8')
    const slice = content.slice(position, position + length)
    slice.copy(buf)
    return slice.length
  })
  function setTailContent(s: string): void { _tailContent = s }

  return {
    updaterHandlers,
    mockGetAllWindows,
    mockCheckForUpdates,
    mockCheckForUpdatesAndNotify,
    mockReadFileSync,
    mockWriteFileSync,
    mockOpenExternal,
    debugLog,
    mockApp,
    autoUpdater,
    mockOpenSync,
    mockCloseSync,
    mockStatSync,
    mockReadSync,
    setTailContent,
  }
})

vi.mock('electron', () => ({
  app: mocks.mockApp,
  BrowserWindow: {
    getAllWindows: mocks.mockGetAllWindows,
  },
  shell: {
    openExternal: mocks.mockOpenExternal,
  },
}))

vi.mock('electron-updater', () => ({
  autoUpdater: mocks.autoUpdater,
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: mocks.mockReadFileSync,
    writeFileSync: mocks.mockWriteFileSync,
    openSync: mocks.mockOpenSync,
    closeSync: mocks.mockCloseSync,
    statSync: mocks.mockStatSync,
    readSync: mocks.mockReadSync,
    default: {
      ...(actual as unknown as { default?: object }).default,
      ...actual,
      readFileSync: mocks.mockReadFileSync,
      writeFileSync: mocks.mockWriteFileSync,
      openSync: mocks.mockOpenSync,
      closeSync: mocks.mockCloseSync,
      statSync: mocks.mockStatSync,
      readSync: mocks.mockReadSync,
    },
  }
})

vi.mock('./debug-log', () => ({
  DEBUG_LOG: '/tmp/manifold-debug.log',
  debugLog: mocks.debugLog,
}))

function emitUpdaterEvent(event: string, payload?: unknown): void {
  const handler = mocks.updaterHandlers.get(event)
  if (!handler) throw new Error(`Missing updater handler for ${event}`)
  if (payload === undefined) {
    handler()
    return
  }
  handler(payload)
}

function createMockWindow(destroyed = false): BrowserWindow {
  return {
    isDestroyed: vi.fn(() => destroyed),
    webContents: {
      isDestroyed: vi.fn(() => destroyed),
      send: vi.fn(),
    },
  } as unknown as BrowserWindow
}

describe('setupAutoUpdater', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.unstubAllGlobals()
    mocks.updaterHandlers.clear()
    mocks.mockGetAllWindows.mockReturnValue([])
    mocks.mockCheckForUpdates.mockResolvedValue(undefined)
    mocks.mockReadFileSync.mockReset()
    mocks.mockWriteFileSync.mockReset()
    mocks.setTailContent('')
    mocks.mockApp.isPackaged = true
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    mocks.autoUpdater.autoDownload = false
    mocks.autoUpdater.autoInstallOnAppQuit = false
  })

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  })

  it('checks on startup and again every hour after the previous check completes', async () => {
    const { setupAutoUpdater } = await import('./auto-updater')

    setupAutoUpdater()

    expect(mocks.autoUpdater.autoDownload).toBe(true)
    expect(mocks.autoUpdater.autoInstallOnAppQuit).toBe(true)
    expect(mocks.mockCheckForUpdates).toHaveBeenCalledTimes(1)

    emitUpdaterEvent('update-not-available')
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

    expect(mocks.mockCheckForUpdates).toHaveBeenCalledTimes(2)
  })

  // Regression: each check must NOT fire electron-updater's built-in OS notification.
  // checkForUpdatesAndNotify() shows "A new update is ready to install" on every check
  // where an update is available, so the hourly checks spammed a fresh macOS notification
  // for the same already-downloaded version. We drive our own dismissible in-app banner
  // via the updater:status broadcast instead.
  it('uses checkForUpdates without electron-updater notifications, even on repeated checks', async () => {
    const { setupAutoUpdater } = await import('./auto-updater')

    setupAutoUpdater()

    // Simulate the same update being re-downloaded on every hourly check.
    for (let hour = 0; hour < 3; hour++) {
      emitUpdaterEvent('update-downloaded', { version: '0.2.86' })
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
    }

    expect(mocks.mockCheckForUpdates).toHaveBeenCalled()
    expect(mocks.mockCheckForUpdatesAndNotify).not.toHaveBeenCalled()
  })

  it('skips updater setup in dev when the app is not packaged', async () => {
    mocks.mockApp.isPackaged = false

    const { setupAutoUpdater } = await import('./auto-updater')

    setupAutoUpdater()

    expect(mocks.mockCheckForUpdates).not.toHaveBeenCalled()
    expect(mocks.autoUpdater.on).not.toHaveBeenCalled()
    expect(mocks.debugLog).toHaveBeenCalledWith('[updater] skipping update checks in dev because the app is not packaged')
  })

  it('skips updater setup for packaged Linux directory installs', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })

    const { setupAutoUpdater } = await import('./auto-updater')

    setupAutoUpdater()

    expect(mocks.mockCheckForUpdates).not.toHaveBeenCalled()
    expect(mocks.autoUpdater.on).not.toHaveBeenCalled()
    expect(mocks.debugLog).toHaveBeenCalledWith('[updater] skipping update checks on Linux (no updater artifact)')
  })

  it('skips updater setup for unpackaged Linux runs', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    mocks.mockApp.isPackaged = false

    const { setupAutoUpdater } = await import('./auto-updater')

    setupAutoUpdater()

    expect(mocks.autoUpdater.on).not.toHaveBeenCalled()
    expect(mocks.debugLog).toHaveBeenCalledWith('[updater] skipping update checks on Linux (no updater artifact)')
  })

  it('does not start a second check while a download is still in progress', async () => {
    const { setupAutoUpdater } = await import('./auto-updater')

    setupAutoUpdater()
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

    expect(mocks.mockCheckForUpdates).toHaveBeenCalledTimes(1)

    emitUpdaterEvent('update-downloaded', { version: '1.2.3' })
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

    expect(mocks.mockCheckForUpdates).toHaveBeenCalledTimes(2)
  })

  it('retries transient startup failures within seconds', async () => {
    mocks.mockCheckForUpdates
      .mockRejectedValueOnce(new Error('504'))
      .mockResolvedValue(undefined)

    const { setupAutoUpdater } = await import('./auto-updater')

    setupAutoUpdater()

    expect(mocks.mockCheckForUpdates).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(4_999)
    expect(mocks.mockCheckForUpdates).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.mockCheckForUpdates).toHaveBeenCalledTimes(2)
    expect(mocks.debugLog).toHaveBeenCalledWith('[updater] scheduling retry 1/3 in 5000ms')
  })

  it('does not retry immediately when the machine is offline', async () => {
    mocks.mockCheckForUpdates.mockRejectedValueOnce(new Error('net::ERR_INTERNET_DISCONNECTED'))

    const { setupAutoUpdater } = await import('./auto-updater')

    setupAutoUpdater()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(mocks.mockCheckForUpdates).toHaveBeenCalledTimes(1)
  })

  it('broadcasts downloaded updates to the currently open windows', async () => {
    const activeWindow = createMockWindow(false)
    const destroyedWindow = createMockWindow(true)
    mocks.mockGetAllWindows.mockReturnValue([activeWindow, destroyedWindow])

    const { setupAutoUpdater } = await import('./auto-updater')

    setupAutoUpdater()
    emitUpdaterEvent('update-downloaded', { version: '1.2.3' })

    expect(activeWindow.webContents.send).toHaveBeenCalledWith('updater:status', {
      status: 'downloaded',
      version: '1.2.3',
    })
    expect(destroyedWindow.webContents.send).not.toHaveBeenCalled()
  })

  it('filters out dev-only updater noise from the log excerpt', async () => {
    mocks.setTailContent([
      '2026-04-18T15:13:06.253Z [updater] triggering startup update check',
      '2026-04-18T15:13:06.254Z [updater] checking for update…',
      '2026-04-18T15:13:18.302Z [updater] error: 504 ',
      '2026-04-18T15:13:18.306Z [updater] check failed: 504 ',
      '2026-04-18T15:14:59.307Z [updater] skipping update checks in dev because the app is not packaged',
    ].join('\n'))

    const { getUpdateLogExcerpt } = await import('./auto-updater')

    expect(getUpdateLogExcerpt()).toContain('[updater] check failed: 504')
    expect(getUpdateLogExcerpt()).not.toContain('skipping update checks in dev because the app is not packaged')
  })

  it('clears updater lines while keeping non-updater debug lines', async () => {
    mocks.mockReadFileSync.mockReturnValue([
      '2026-04-18T15:13:06.253Z [updater] triggering startup update check',
      '2026-04-18T15:13:07.000Z [renderer] process gone: reason=crashed exitCode=1',
      '2026-04-18T15:13:18.306Z [updater] check failed: 504 ',
    ].join('\n'))

    const { clearUpdateLog } = await import('./auto-updater')

    clearUpdateLog()

    expect(mocks.mockWriteFileSync).toHaveBeenCalledWith(
      '/tmp/manifold-debug.log',
      '2026-04-18T15:13:07.000Z [renderer] process gone: reason=crashed exitCode=1\n',
      'utf8',
    )
  })

  it('loads release notes for the current version from GitHub', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: 'v0.2.17',
        name: 'Manifold v0.2.17',
        body: '## Summary\n- Improved updates',
        html_url: 'https://github.com/vippsas/manifold/releases/tag/v0.2.17',
        published_at: '2026-05-20T12:00:00.000Z',
      }),
    }))

    const { getReleaseNotes } = await import('./auto-updater')

    await expect(getReleaseNotes()).resolves.toEqual({
      version: '0.2.17',
      name: 'Manifold v0.2.17',
      body: '## Summary\n- Improved updates',
      url: 'https://github.com/vippsas/manifold/releases/tag/v0.2.17',
      publishedAt: '2026-05-20T12:00:00.000Z',
      source: 'github',
    })
  })

  it('returns a fallback release note when GitHub is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }))

    const { getReleaseNotes } = await import('./auto-updater')
    const notes = await getReleaseNotes('0.2.99')

    expect(notes.source).toBe('fallback')
    expect(notes.version).toBe('0.2.99')
    expect(notes.url).toContain('/releases/tag/v0.2.99')
  })

  it('opens the current release notes on GitHub', async () => {
    const { openReleaseNotesExternal } = await import('./auto-updater')

    await openReleaseNotesExternal()

    expect(mocks.mockOpenExternal).toHaveBeenCalledWith(
      'https://github.com/vippsas/manifold/releases/tag/v0.2.17',
    )
  })

  // #507 — fallback release notes must not be cached so a subsequent call can return real notes
  it('does not cache a fallback from a failed fetch so a retry can return real notes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          tag_name: 'v0.2.99',
          name: 'Manifold v0.2.99',
          body: '## Real notes',
          html_url: 'https://github.com/releases/tag/v0.2.99',
          published_at: '2026-06-01T00:00:00Z',
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { getReleaseNotes } = await import('./auto-updater')

    const first = await getReleaseNotes('0.2.99')
    expect(first.source).toBe('fallback')

    const second = await getReleaseNotes('0.2.99')
    expect(second.source).toBe('github')
    expect(second.body).toBe('## Real notes')
  })

  it('does not cache a fallback from a network error so a retry can return real notes', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          tag_name: 'v0.3.00',
          name: 'Manifold v0.3.00',
          body: '## Real notes v0.3.00',
          html_url: 'https://github.com/releases/tag/v0.3.00',
          published_at: '2026-06-02T00:00:00Z',
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { getReleaseNotes } = await import('./auto-updater')

    const first = await getReleaseNotes('0.3.00')
    expect(first.source).toBe('fallback')

    const second = await getReleaseNotes('0.3.00')
    expect(second.source).toBe('github')
  })

  // #508 — updateCheckInFlight must not get stuck when checkForUpdatesAndNotify resolves null (dev)
  it('does not block a second check when the first resolves null (dev mode)', async () => {
    mocks.mockCheckForUpdates.mockResolvedValue(null)
    mocks.mockApp.isPackaged = true // packaged so setupAutoUpdater runs, but updater returns null

    const { checkForUpdates } = await import('./auto-updater')

    await checkForUpdates('manual')
    // If the flag was stuck we'd get "updater is busy" and skip the call
    await checkForUpdates('manual')

    expect(mocks.mockCheckForUpdates).toHaveBeenCalledTimes(2)
  })

  // #501 — getUpdateLogExcerpt reads only the tail, not the whole file
  it('reads only the tail of debug.log to build the updater excerpt', async () => {
    // Fill content larger than would be useful, check that openSync/statSync/readSync are used
    const lines = Array.from({ length: 200 }, (_, i) =>
      `2026-04-18T15:13:${String(i).padStart(2, '0')}.000Z [updater] check ${i}`,
    ).join('\n')
    mocks.setTailContent(lines)

    const { getUpdateLogExcerpt } = await import('./auto-updater')

    const excerpt = getUpdateLogExcerpt()
    expect(mocks.mockOpenSync).toHaveBeenCalledWith('/tmp/manifold-debug.log', 'r')
    expect(mocks.mockCloseSync).toHaveBeenCalled()
    // Should return at most UPDATE_LOG_LINE_LIMIT (80) lines
    const excerptLines = excerpt.split('\n')
    expect(excerptLines.length).toBeLessThanOrEqual(80)
    expect(excerpt).toContain('[updater] check')
  })
})
