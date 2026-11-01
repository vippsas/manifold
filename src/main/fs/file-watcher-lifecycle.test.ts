import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { FileWatcher } from './file-watcher'

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  stat: vi.fn(async () => ({ isDirectory: () => false, mtimeMs: 1, size: 1 })),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('FileWatcher shared producer lifecycle', () => {
  let watcher: FileWatcher
  const status = vi.fn<(cwd: string) => Promise<string>>()
  const branch = vi.fn<(cwd: string) => Promise<string>>()
  const send = vi.fn()
  const onBranch = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    status.mockReset().mockResolvedValue('')
    branch.mockReset().mockResolvedValue('main')
    watcher = new FileWatcher(status, undefined, undefined, branch)
    watcher.setMainWindow({ isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow)
    watcher.setOnBranchChanged(onBranch)
  })

  afterEach(async () => {
    await watcher.unwatchAll()
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('shares an in-flight request and sends no status or branch event to removed subscribers', async () => {
    const pending = deferred<string>()
    status.mockReturnValueOnce(pending.promise)
    watcher.watch('/repo/a', 'removed-primary')
    watcher.watch('/repo/a', 'live-primary')
    watcher.watchAdditionalDir('/repo/a', 'removed-additional')
    watcher.watchAdditionalDir('/repo/a', 'live-additional')
    await watcher.unwatch('/repo/a', 'removed-primary')
    watcher.unwatchAdditionalDir('/repo/a', 'removed-additional')
    await vi.advanceTimersByTimeAsync(6000)
    expect(status).toHaveBeenCalledTimes(1)
    pending.resolve('')
    await vi.advanceTimersByTimeAsync(0)
    expect(send.mock.calls.map(([, payload]) => payload.sessionId)).toEqual([
      'live-primary', 'live-primary', 'live-additional',
    ])
    expect(onBranch).toHaveBeenCalledExactlyOnceWith('live-primary', 'main')
  })

  it('does not let a removed producer emit into a replacement at the same path and id', async () => {
    const pending = deferred<string>()
    status.mockReturnValueOnce(pending.promise)
    watcher.watch('/repo/a', 's1')
    await watcher.unwatch('/repo/a/', 's1')
    watcher.watch('/repo/a/', 's1')
    await vi.advanceTimersByTimeAsync(0)
    send.mockClear()
    onBranch.mockClear()
    pending.resolve('?? stale.txt\n')
    await vi.advanceTimersByTimeAsync(0)
    expect(send).not.toHaveBeenCalled()
    expect(onBranch).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('suppresses branch results for sessions removed during the branch read', async () => {
    const pending = deferred<string>()
    branch.mockReturnValueOnce(pending.promise)
    watcher.watch('/repo/a', 's1')
    watcher.watch('/repo/a', 's2')
    await vi.advanceTimersByTimeAsync(0)
    await watcher.unwatch('/repo/a', 's1')
    pending.resolve('changed')
    await vi.advanceTimersByTimeAsync(0)
    expect(onBranch).toHaveBeenCalledExactlyOnceWith('s2', 'changed')
  })

  it.each(['HEAD', ''])('does not replay the previous branch after a %j branch result', async (result) => {
    watcher.watch('/repo/a', 's1')
    await vi.advanceTimersByTimeAsync(0)
    branch.mockResolvedValue(result)
    await vi.advanceTimersByTimeAsync(2000)
    onBranch.mockClear()

    watcher.watch('/repo/a', 's2')
    await vi.advanceTimersByTimeAsync(2000)

    expect(onBranch).not.toHaveBeenCalled()
  })

  it('refreshes the branch after a producer has had only additional-directory consumers', async () => {
    watcher.watch('/repo/a', 's1')
    watcher.watchAdditionalDir('/repo/a', 'additional')
    await vi.advanceTimersByTimeAsync(0)
    await watcher.unwatch('/repo/a', 's1')
    branch.mockResolvedValue('renamed')
    await vi.advanceTimersByTimeAsync(2000)
    onBranch.mockClear()

    watcher.watch('/repo/a', 's2')
    expect(onBranch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(onBranch).toHaveBeenCalledExactlyOnceWith('s2', 'renamed')
  })

  it.each([false, true])('discards an in-flight branch result after the final primary leaves (rejoined=%s)', async (rejoined) => {
    const pending = deferred<string>()
    branch.mockReturnValueOnce(pending.promise)
    watcher.watch('/repo/a', 's1')
    watcher.watchAdditionalDir('/repo/a', 'additional')
    await vi.advanceTimersByTimeAsync(0)
    await watcher.unwatch('/repo/a', 's1')
    if (rejoined) watcher.watch('/repo/a', 's2')
    pending.resolve('stale')
    await vi.advanceTimersByTimeAsync(0)

    if (!rejoined) watcher.watch('/repo/a', 's2')
    expect(onBranch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(onBranch).toHaveBeenCalledExactlyOnceWith('s2', 'main')
  })

  it('drops late results and every timer after unwatchAll', async () => {
    const pending = deferred<string>()
    status.mockReturnValue(pending.promise)
    watcher.watch('/repo/a', 's1')
    watcher.watchAdditionalDir('/repo/a', 's2')
    watcher.watchAdditionalDir('/repo/b', 's3')
    await watcher.unwatchAll()
    pending.resolve('')
    await vi.advanceTimersByTimeAsync(6000)
    expect(status).toHaveBeenCalledTimes(2)
    expect(send).not.toHaveBeenCalled()
    expect(onBranch).not.toHaveBeenCalled()
  })

  it.each([
    Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT', syscall: 'spawn git' }),
    new Error('fatal: not a git repository'),
  ])('disables the shared producer after one permanent failure: %s', async (error) => {
    status.mockRejectedValue(error)
    watcher.watch('/repo/a', 's1')
    watcher.watchAdditionalDir('/repo/a/', 's2')
    watcher.watchAdditionalDir('/repo/a', 's3')
    await vi.advanceTimersByTimeAsync(0)
    watcher.watch('/repo/a', 's4')
    await vi.advanceTimersByTimeAsync(8000)
    expect(status).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it('retries transient errors on the next tick', async () => {
    status.mockRejectedValueOnce(new Error('temporarily unavailable'))
    watcher.watchAdditionalDir('/repo/a', 's1')
    await vi.advanceTimersByTimeAsync(2000)
    expect(status).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledExactlyOnceWith('files:changed', { sessionId: 's1', source: '/repo/a', changes: [] })
  })

  it('path-wide primary unwatch preserves additional-dir consumers', async () => {
    watcher.watch('/repo/a', 's1')
    watcher.watchAdditionalDir('/repo/a', 's2')
    await vi.advanceTimersByTimeAsync(0)
    await watcher.unwatch('/repo/a/')
    send.mockClear()
    status.mockResolvedValue('?? new.txt\n')
    await vi.advanceTimersByTimeAsync(2000)
    expect(send).toHaveBeenCalledExactlyOnceWith('files:changed', {
      sessionId: 's2', source: '/repo/a', changes: [{ path: 'new.txt', type: 'added' }],
    })
  })
})
