import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
  }
})

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(),
  },
  ipcMain: {
    handle: mocks.handle,
  },
}))

describe('registerSimpleHandlers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  it('removes chatSubscription entry when sender window is destroyed', async () => {
    const { BrowserWindow } = await import('electron')
    const { registerSimpleHandlers } = await import('./simple-handlers')

    const destroyedListeners: Array<() => void> = []
    const mockWebContents = {
      id: 42,
      send: vi.fn(),
      once: vi.fn((event: string, cb: () => void) => {
        if (event === 'destroyed') destroyedListeners.push(cb)
      }),
    }
    const mockWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: mockWebContents,
    }
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(mockWindow as never)

    const unsub = vi.fn()
    const chatAdapter = {
      getMessages: vi.fn(() => []),
      loadMessages: vi.fn(() => []),
      setSessionStorage: vi.fn(),
      onMessage: vi.fn(() => unsub),
    }
    const sessionManager = {
      getSession: vi.fn(() => undefined),
    }

    registerSimpleHandlers({ chatAdapter, sessionManager } as never)

    const handler = mocks.handlers.get('simple:subscribe-chat')
    if (!handler) throw new Error('simple:subscribe-chat handler was not registered')

    const event = { sender: mockWebContents }
    await handler(event as never, 'sess-1')

    // Subscription should be set
    expect(chatAdapter.onMessage).toHaveBeenCalledWith('sess-1', expect.any(Function))

    // Trigger the destroyed event — cleanup should run
    expect(destroyedListeners).toHaveLength(1)
    destroyedListeners[0]()

    expect(unsub).toHaveBeenCalledTimes(1)
  })

  it('does not accumulate chatSubscriptions across re-subscribes with the same key', async () => {
    const { BrowserWindow } = await import('electron')
    const { registerSimpleHandlers } = await import('./simple-handlers')

    const mockWebContents = {
      id: 7,
      send: vi.fn(),
      once: vi.fn(),
    }
    const mockWindow = {
      isDestroyed: vi.fn(() => false),
      webContents: mockWebContents,
    }
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(mockWindow as never)

    const unsub1 = vi.fn()
    const unsub2 = vi.fn()
    let callCount = 0
    const chatAdapter = {
      getMessages: vi.fn(() => []),
      loadMessages: vi.fn(() => []),
      setSessionStorage: vi.fn(),
      onMessage: vi.fn(() => (++callCount === 1 ? unsub1 : unsub2)),
    }
    const sessionManager = {
      getSession: vi.fn(() => undefined),
    }

    registerSimpleHandlers({ chatAdapter, sessionManager } as never)

    const handler = mocks.handlers.get('simple:subscribe-chat')
    if (!handler) throw new Error('simple:subscribe-chat handler was not registered')

    const event = { sender: mockWebContents }

    // First subscribe
    await handler(event as never, 'sess-2')
    // Second subscribe with same key should unsubscribe the first
    await handler(event as never, 'sess-2')

    expect(unsub1).toHaveBeenCalledTimes(1)
    expect(unsub2).not.toHaveBeenCalled()
  })

  it('wires one destroyed listener per window, however many sessions it subscribes', async () => {
    const { BrowserWindow } = await import('electron')
    const { registerSimpleHandlers } = await import('./simple-handlers')

    const destroyedListeners: Array<() => void> = []
    const mockWebContents = {
      id: 7,
      send: vi.fn(),
      once: vi.fn((event: string, cb: () => void) => {
        if (event === 'destroyed') destroyedListeners.push(cb)
      }),
    }
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({
      isDestroyed: vi.fn(() => false),
      webContents: mockWebContents,
    } as never)

    const unsubs = [vi.fn(), vi.fn(), vi.fn()]
    let call = 0
    const chatAdapter = {
      getMessages: vi.fn(() => []),
      loadMessages: vi.fn(() => []),
      setSessionStorage: vi.fn(),
      onMessage: vi.fn(() => unsubs[call++] ?? vi.fn()),
    }
    registerSimpleHandlers({ chatAdapter, sessionManager: { getSession: vi.fn(() => undefined) } } as never)
    const handler = mocks.handlers.get('simple:subscribe-chat')!
    const event = { sender: mockWebContents }

    // A Viola run subscribes many sessions from one window, and a remount re-subscribes one.
    await handler(event as never, 'viola-1')
    await handler(event as never, 'worker-1')
    await handler(event as never, 'viola-1')

    // Electron warns past ten listeners on one emitter, so this must not grow per subscription.
    expect(destroyedListeners).toHaveLength(1)

    // The single listener still releases every subscription the window held.
    destroyedListeners[0]()
    expect(unsubs[1]).toHaveBeenCalledTimes(1)
    expect(unsubs[2]).toHaveBeenCalledTimes(1)
  })
})
