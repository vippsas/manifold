import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { BrowserWindow } from 'electron'

const mocks = vi.hoisted(() => {
  const updaterHandlers = new Map<string, (...args: unknown[]) => void>()
  const mockGetAllWindows = vi.fn()
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
    checkForUpdatesAndNotify: mockCheckForUpdatesAndNotify,
  }

  return {
    updaterHandlers,
    mockGetAllWindows,
    mockCheckForUpdatesAndNotify,
    mockReadFileSync,
    mockWriteFileSync,
    mockOpenExternal,
    debugLog,
    mockApp,
    autoUpdater,
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
    default: {
      ...(actual as unknown as { default?: object }).default,
      ...actual,
      readFileSync: mocks.mockReadFileSync,
      writeFileSync: mocks.mockWriteFileSync,
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
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.unstubAllGlobals()
    mocks.updaterHandlers.clear()
    mocks.mockGetAllWindows.mockReturnValue([])
    mocks.mockCheckForUpdatesAndNotify.mockResolvedValue(undefined)
    mocks.mockReadFileSync.mockReset()
    mocks.mockWriteFileSync.mockReset()
    mocks.mockApp.isPackaged = true
    mocks.autoUpdater.autoDownload = false
    mocks.autoUpdater.autoInstallOnAppQuit = false
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('checks on startup and again every hour after the previous check completes', async () => {
    const { setupAutoUpdater } = await import('./auto-updater')

    setupAutoUpdater()

    expect(mocks.autoUpdater.autoDownload).toBe(true)
    expect(mocks.autoUpdater.autoInstallOnAppQuit).toBe(true)
    expect(mocks.mockCheckForUpdatesAndNotify).toHaveBeenCalledTimes(1)

    emitUpdaterEvent('update-not-available')
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

    expect(mocks.mockCheckForUpdatesAndNotify).toHaveBeenCalledTimes(2)
  })

  it('skips updater setup in dev when the app is not packaged', async () => {
    mocks.mockApp.isPackaged = false

    const { setupAutoUpdater } = await import('./auto-updater')

    setupAutoUpdater()

    expect(mocks.mockCheckForUpdatesAndNotify).not.toHaveBeenCalled()
    expect(mocks.autoUpdater.on).not.toHaveBeenCalled()
    expect(mocks.debugLog).toHaveBeenCalledWith('[updater] skipping update checks in dev because the app is not packaged')
  })

  it('does not start a second check while a download is still in progress', async () => {
    const { setupAutoUpdater } = await import('./auto-updater')

    setupAutoUpdater()
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

    expect(mocks.mockCheckForUpdatesAndNotify).toHaveBeenCalledTimes(1)

    emitUpdaterEvent('update-downloaded', { version: '1.2.3' })
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

    expect(mocks.mockCheckForUpdatesAndNotify).toHaveBeenCalledTimes(2)
  })

  it('retries transient startup failures within seconds', async () => {
    mocks.mockCheckForUpdatesAndNotify
      .mockRejectedValueOnce(new Error('504'))
      .mockResolvedValue(undefined)

    const { setupAutoUpdater } = await import('./auto-updater')

    setupAutoUpdater()

    expect(mocks.mockCheckForUpdatesAndNotify).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(4_999)
    expect(mocks.mockCheckForUpdatesAndNotify).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.mockCheckForUpdatesAndNotify).toHaveBeenCalledTimes(2)
    expect(mocks.debugLog).toHaveBeenCalledWith('[updater] scheduling retry 1/3 in 5000ms')
  })

  it('does not retry immediately when the machine is offline', async () => {
    mocks.mockCheckForUpdatesAndNotify.mockRejectedValueOnce(new Error('net::ERR_INTERNET_DISCONNECTED'))

    const { setupAutoUpdater } = await import('./auto-updater')

    setupAutoUpdater()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(mocks.mockCheckForUpdatesAndNotify).toHaveBeenCalledTimes(1)
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
    mocks.mockReadFileSync.mockReturnValue([
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
})
