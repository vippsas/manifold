import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, fn: (event: unknown, ...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
    getAllWindows: vi.fn(() => [] as unknown[]),
    writeShellPromptSegmentsFile: vi.fn(),
  }
})

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle },
  BrowserWindow: { getAllWindows: mocks.getAllWindows },
}))

vi.mock('node:fs', () => {
  const mkdirSync = vi.fn()
  return { mkdirSync, default: { mkdirSync } }
})

vi.mock('../agent/runtimes', () => ({
  listRuntimesWithStatus: vi.fn(),
}))

vi.mock('../agent/ollama-models', () => ({
  listOllamaModels: vi.fn(),
}))

vi.mock('../session/shell-prompt-config', () => ({
  writeShellPromptSegmentsFile: mocks.writeShellPromptSegmentsFile,
}))

interface FakeWindow {
  webContents: { send: ReturnType<typeof vi.fn> }
  isDestroyed: () => boolean
}

function makeWindow(destroyed = false): FakeWindow {
  return {
    webContents: { send: vi.fn() },
    isDestroyed: () => destroyed,
  }
}

describe('registerSettingsHandlers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  it('broadcasts settings:changed with the updated settings to every live window', async () => {
    const { registerSettingsHandlers } = await import('./settings-handlers')
    const updated = { defaultAgentMode: 'chat' as const, theme: 'dark' }
    const settingsStore = {
      getSettings: vi.fn(() => ({})),
      updateSettings: vi.fn(() => updated),
    }
    const winA = makeWindow()
    const winB = makeWindow()
    mocks.getAllWindows.mockReturnValue([winA, winB])

    registerSettingsHandlers({ settingsStore } as Parameters<typeof registerSettingsHandlers>[0])
    const handler = mocks.handlers.get('settings:update')!
    handler(undefined, { defaultAgentMode: 'chat' })

    expect(settingsStore.updateSettings).toHaveBeenCalledWith({ defaultAgentMode: 'chat' })
    expect(winA.webContents.send).toHaveBeenCalledWith('settings:changed', updated)
    expect(winB.webContents.send).toHaveBeenCalledWith('settings:changed', updated)
  })

  it('skips windows that report isDestroyed=true (does not throw, does not send)', async () => {
    const { registerSettingsHandlers } = await import('./settings-handlers')
    const updated = { theme: 'light' }
    const settingsStore = {
      getSettings: vi.fn(() => ({})),
      updateSettings: vi.fn(() => updated),
    }
    const live = makeWindow(false)
    const dead = makeWindow(true)
    mocks.getAllWindows.mockReturnValue([live, dead])

    registerSettingsHandlers({ settingsStore } as Parameters<typeof registerSettingsHandlers>[0])
    const handler = mocks.handlers.get('settings:update')!

    expect(() => handler(undefined, { theme: 'light' })).not.toThrow()
    expect(live.webContents.send).toHaveBeenCalledWith('settings:changed', updated)
    expect(dead.webContents.send).not.toHaveBeenCalled()
  })

  it('returns the updated settings to the caller', async () => {
    const { registerSettingsHandlers } = await import('./settings-handlers')
    const updated = { defaultAgentMode: 'interactive' as const }
    const settingsStore = {
      getSettings: vi.fn(() => ({})),
      updateSettings: vi.fn(() => updated),
    }
    mocks.getAllWindows.mockReturnValue([])

    registerSettingsHandlers({ settingsStore } as Parameters<typeof registerSettingsHandlers>[0])
    const result = mocks.handlers.get('settings:update')!(undefined, { defaultAgentMode: 'interactive' })

    expect(result).toEqual(updated)
  })

  it('syncs the shared prompt-segments file with current settings at registration', async () => {
    const { registerSettingsHandlers } = await import('./settings-handlers')
    const segments = { repo: true, agent: false, k8sContext: false, k8sNamespace: false }
    const settingsStore = {
      getSettings: vi.fn(() => ({ shellPromptSegments: segments })),
      updateSettings: vi.fn(() => ({})),
    }

    registerSettingsHandlers({ settingsStore } as Parameters<typeof registerSettingsHandlers>[0])

    expect(mocks.writeShellPromptSegmentsFile).toHaveBeenCalledWith(segments)
  })

  it('rewrites the prompt-segments file when a settings update changes the segments', async () => {
    const { registerSettingsHandlers } = await import('./settings-handlers')
    const segments = { repo: true, agent: true, k8sContext: true, k8sNamespace: false }
    const settingsStore = {
      getSettings: vi.fn(() => ({})),
      updateSettings: vi.fn(() => ({ shellPromptSegments: segments })),
    }
    mocks.getAllWindows.mockReturnValue([])

    registerSettingsHandlers({ settingsStore } as Parameters<typeof registerSettingsHandlers>[0])
    mocks.writeShellPromptSegmentsFile.mockClear()
    mocks.handlers.get('settings:update')!(undefined, { shellPromptSegments: segments })

    expect(mocks.writeShellPromptSegmentsFile).toHaveBeenCalledWith(segments)
  })

  it('leaves the prompt-segments file alone for unrelated settings updates', async () => {
    const { registerSettingsHandlers } = await import('./settings-handlers')
    const settingsStore = {
      getSettings: vi.fn(() => ({})),
      updateSettings: vi.fn(() => ({})),
    }
    mocks.getAllWindows.mockReturnValue([])

    registerSettingsHandlers({ settingsStore } as Parameters<typeof registerSettingsHandlers>[0])
    mocks.writeShellPromptSegmentsFile.mockClear()
    mocks.handlers.get('settings:update')!(undefined, { notificationSound: true })

    expect(mocks.writeShellPromptSegmentsFile).not.toHaveBeenCalled()
  })
})
