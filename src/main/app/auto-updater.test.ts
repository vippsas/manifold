import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { BrowserWindow } from 'electron'

const mocks = vi.hoisted(() => {
  const updaterHandlers = new Map<string, (...args: unknown[]) => void>()
  const mockGetAllWindows = vi.fn()
  const mockCheckForUpdatesAndNotify = vi.fn()
  const debugLog = vi.fn()
  const mockApp = {
    isPackaged: true,
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
}))

vi.mock('electron-updater', () => ({
  autoUpdater: mocks.autoUpdater,
}))

vi.mock('./debug-log', () => ({
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
    mocks.updaterHandlers.clear()
    mocks.mockGetAllWindows.mockReturnValue([])
    mocks.mockCheckForUpdatesAndNotify.mockResolvedValue(undefined)
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
})
