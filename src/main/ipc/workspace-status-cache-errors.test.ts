import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { FileWatcher } from '../fs/file-watcher'
import { VerdictPollForwarder } from '../fs/verdict-poll-forwarder'
import { invalidateCheckoutStatus } from '../fs/checkout-status-cache'
import { createWorkspaceStatusReader } from './workspace-status'

const git = vi.hoisted(() => ({ status: vi.fn(), exec: vi.fn() }))
vi.mock('../git/git-exec', () => ({ gitExec: git.exec }))
vi.mock('../fs/file-watcher-utils', async (importOriginal) => ({
  ...await importOriginal<typeof import('../fs/file-watcher-utils')>(),
  gitStatus: git.status,
  buildChangeFingerprint: async () => 'fixture',
}))

function deferred() {
  let resolve!: (value: string) => void
  let reject!: (error: Error) => void
  const promise = new Promise<string>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

describe('workspace status cache failure and invalidation', () => {
  let watcher: FileWatcher
  const send = vi.fn()
  const branch = vi.fn()
  const read = createWorkspaceStatusReader({
    workspaceManager: { get: () => ({ projectIds: ['p1'] }) },
    projectRegistry: { getProject: () => ({ name: 'repo', path: '/repo' }) },
  } as never)

  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
    git.exec.mockResolvedValue('main')
    git.status.mockResolvedValue('?? old.ts\n')
    branch.mockResolvedValue('main')
    watcher = new FileWatcher(git.status, undefined, undefined, branch)
    watcher.setMainWindow({ isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow)
  })

  afterEach(async () => {
    await watcher.unwatchAll()
    expect(vi.getTimerCount()).toBe(0)
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it.each([
    new Error('temporarily unreadable'),
    new Error('fatal: not a git repository'),
    Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT', syscall: 'spawn git' }),
  ])('does not reuse the retained snapshot after %s', async (error) => {
    watcher.watch('/repo', 'existing')
    await vi.advanceTimersByTimeAsync(0)
    git.status.mockRejectedValue(error)
    await vi.advanceTimersByTimeAsync(2000)
    await expect(read('ws')).resolves.toMatchObject([{ staged: [], unstaged: [], untracked: [] }])
    expect(git.status).toHaveBeenCalledTimes(3)
    expect(vi.getTimerCount()).toBe(error.message === 'temporarily unreadable' ? 1 : 0)
  })

  it('rejects the retained snapshot after a non-repo failure with a late subscriber', async () => {
    watcher.watch('/repo', 'existing')
    await vi.advanceTimersByTimeAsync(0)
    const pending = deferred()
    git.status.mockReturnValueOnce(pending.promise)
    await vi.advanceTimersByTimeAsync(2000)
    watcher.watch('/repo/', 'late')
    pending.reject(new Error('fatal: not a git repository'))
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)

    // Retained watcher state must not become phantom rows for a deleted repo.
    git.status.mockRejectedValue(new Error('checkout deleted'))
    expect((await read('ws'))[0].untracked).toEqual([])
    expect(git.status).toHaveBeenCalledTimes(3)
  })

  it('drops an invalidated in-flight poll without change events or verdict activity', async () => {
    const verdict = vi.spyOn(VerdictPollForwarder.prototype, 'notifyGitChange').mockResolvedValue()
    watcher.watch('/repo', 'session')
    await vi.advanceTimersByTimeAsync(0)
    send.mockClear()
    verdict.mockClear()
    const pending = deferred()
    git.status.mockReturnValueOnce(pending.promise)
    await vi.advanceTimersByTimeAsync(2000)
    invalidateCheckoutStatus('/other/../repo/')
    pending.resolve('?? pre-mutation.ts\n')
    await vi.advanceTimersByTimeAsync(0)
    expect(send).not.toHaveBeenCalled()
    expect(verdict).not.toHaveBeenCalled()

    git.status.mockResolvedValue('')
    expect((await read('ws'))[0].untracked).toEqual([])
    expect(git.status).toHaveBeenCalledTimes(3)
    // Invalidation must also leave change detection intact on an unchanged tick.
    git.status.mockResolvedValue('?? old.ts\n')
    await vi.advanceTimersByTimeAsync(2000)
    expect(send).not.toHaveBeenCalled()
    expect(verdict).not.toHaveBeenCalled()
  })

  it('does not restore an invalidated branch from a pending branch read', async () => {
    const pending = deferred()
    branch.mockReturnValueOnce(pending.promise)
    watcher.watch('/repo', 'session')
    await vi.advanceTimersByTimeAsync(0)
    invalidateCheckoutStatus('/repo')
    pending.resolve('old-branch')
    await vi.advanceTimersByTimeAsync(0)
    expect((await read('ws'))[0].branch).toBe('main')
    expect(git.status).toHaveBeenCalledTimes(2)
  })

  it.each(['', 'HEAD'])('preserves workspace branch semantics for a polled branch of %j', async (polledBranch) => {
    branch.mockResolvedValue(polledBranch)
    git.exec.mockResolvedValue(polledBranch || 'fallback')
    watcher.watch('/repo', 'session')
    await vi.advanceTimersByTimeAsync(0)
    expect((await read('ws'))[0].branch).toBe(polledBranch || 'fallback')
    expect(git.status).toHaveBeenCalledTimes(1)
    expect(git.exec.mock.calls.filter(([args]) => args[0] === 'rev-parse')).toHaveLength(polledBranch ? 0 : 1)
  })
})
