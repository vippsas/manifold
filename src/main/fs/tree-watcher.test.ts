import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (...args: unknown[]) => void

const chokidarMock = vi.hoisted(() => {
  const handlers = new Map<string, Handler>()
  const watcher = {
    on: vi.fn((event: string, handler: Handler) => {
      handlers.set(event, handler)
      return watcher
    }),
    close: vi.fn(async () => {}),
  }

  return {
    handlers,
    watcher,
    watch: vi.fn(() => watcher),
  }
})

vi.mock('chokidar', () => ({
  default: {
    watch: chokidarMock.watch,
  },
}))

import { ChokidarTreeWatcher } from './tree-watcher'

describe('ChokidarTreeWatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    chokidarMock.handlers.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits a debounced tree change when file content changes', async () => {
    const watcher = new ChokidarTreeWatcher()
    const onTreeChanged = vi.fn()

    watcher.setOnTreeChanged(onTreeChanged)
    watcher.watch('/repo/worktree', 'session-1')

    expect(chokidarMock.watcher.on).toHaveBeenCalledWith('change', expect.any(Function))

    chokidarMock.handlers.get('change')?.('/repo/worktree/file.ts')
    await vi.advanceTimersByTimeAsync(199)
    expect(onTreeChanged).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(onTreeChanged).toHaveBeenCalledWith('session-1')

    await watcher.unwatchAll()
  })
})
