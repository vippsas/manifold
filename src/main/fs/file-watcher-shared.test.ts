import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { FileWatcher } from './file-watcher'
import { VerdictPollForwarder } from './verdict-poll-forwarder'

vi.mock('node:fs/promises', () => ({ stat: vi.fn(async () => ({
  isDirectory: () => false, mtimeMs: 1, size: 1,
})) }))
import { stat } from 'node:fs/promises'

class FakeGit {
  status = 'UU conflict.txt\n'
  branch = 'main'
  calls: string[] = []
  branches: string[] = []
  readStatus = async (cwd: string): Promise<string> => { this.calls.push(cwd); return this.status }
  readBranch = async (cwd: string): Promise<string> => { this.branches.push(cwd); return this.branch }
}

class FakeTreeWatcher {
  roots = new Set<string>()
  watches: string[] = []
  listener?: (sessionId: string, root: string) => void
  watch(root: string): void { this.watches.push(root); this.roots.add(root) }
  async unwatch(root: string): Promise<void> { this.roots.delete(root) }
  async unwatchAll(): Promise<void> { this.roots.clear() }
  setOnTreeChanged(fn: (sessionId: string, root: string) => void): void { this.listener = fn }
}

describe('FileWatcher shared checkout subscriptions', () => {
  let watcher: FileWatcher
  let git: FakeGit
  let tree: FakeTreeWatcher
  const send = vi.fn()
  const branchChanged = vi.fn()
  let verdict: ReturnType<typeof vi.spyOn<VerdictPollForwarder, 'notifyGitChange'>>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    verdict = vi.spyOn(VerdictPollForwarder.prototype, 'notifyGitChange').mockResolvedValue()
    git = new FakeGit()
    tree = new FakeTreeWatcher()
    watcher = new FileWatcher(git.readStatus, tree, undefined, git.readBranch)
    watcher.setMainWindow({ isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow)
    watcher.setOnBranchChanged(branchChanged)
  })

  afterEach(async () => {
    await watcher.unwatchAll()
    expect(vi.getTimerCount()).toBe(0)
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('polls and fingerprints once for three additional-dir sessions, and preserves original sources', async () => {
    watcher.watchAdditionalDir('/repo/shared/', 's1')
    watcher.watchAdditionalDir('/repo/shared', 's2')
    watcher.watchAdditionalDir('/repo/other/../shared', 's3')
    await vi.advanceTimersByTimeAsync(0)
    expect(git.calls).toEqual(['/repo/shared'])
    expect(stat).toHaveBeenCalledTimes(1)
    expect(send.mock.calls).toEqual([
      ['files:changed', { sessionId: 's1', source: '/repo/shared/', changes: [{ path: 'conflict.txt', type: 'modified' }] }],
      ['files:changed', { sessionId: 's2', source: '/repo/shared', changes: [{ path: 'conflict.txt', type: 'modified' }] }],
      ['files:changed', { sessionId: 's3', source: '/repo/other/../shared', changes: [{ path: 'conflict.txt', type: 'modified' }] }],
    ])
    git.status = ''
    send.mockClear()
    await vi.advanceTimersByTimeAsync(2000)
    expect(git.calls).toHaveLength(2)
    expect(send).toHaveBeenCalledTimes(3)
    expect(git.branches).toEqual([])
    expect(branchChanged).not.toHaveBeenCalled()
    expect(verdict).not.toHaveBeenCalled()
  })

  it('shares primary and additional polls and fans out conflicts, branch and verdict signals only to primaries', async () => {
    watcher.watch('/repo/a/', 's1')
    watcher.watchAdditionalDir('/repo/a', 's2')
    watcher.watch('/repo/a/../a', 's3')
    await vi.advanceTimersByTimeAsync(0)
    expect(git.calls).toEqual(['/repo/a'])
    expect(git.branches).toEqual(['/repo/a'])
    expect(send).toHaveBeenCalledWith('files:changed', {
      sessionId: 's1', changes: [{ path: 'conflict.txt', type: 'modified' }],
    })
    expect(send).toHaveBeenCalledWith('files:changed', expect.objectContaining({ sessionId: 's2', source: '/repo/a' }))
    for (const id of ['s1', 's3']) {
      expect(send).toHaveBeenCalledWith('agent:conflicts', { sessionId: id, conflicts: ['conflict.txt'] })
      expect(branchChanged).toHaveBeenCalledWith(id, 'main')
      expect(verdict).toHaveBeenCalledWith('/repo/a', id, expect.any(Function), true)
    }
    expect(verdict).toHaveBeenCalledTimes(2)
    expect(branchChanged).toHaveBeenCalledTimes(2)
    git.branch = 'renamed'
    await vi.advanceTimersByTimeAsync(2000)
    expect(git.calls).toHaveLength(2)
    expect(branchChanged).toHaveBeenCalledWith('s1', 'renamed')
    expect(branchChanged).toHaveBeenCalledWith('s3', 'renamed')
  })

  it('replays cached state only for new subscribers without an extra status call', async () => {
    watcher.watch('/repo/a', 's1')
    await vi.advanceTimersByTimeAsync(0)
    send.mockClear()
    branchChanged.mockClear()
    verdict.mockClear()
    watcher.watch('/repo/a/', 's1')
    expect(tree.watches).toEqual(['/repo/a'])
    expect(send).not.toHaveBeenCalled()
    expect(branchChanged).not.toHaveBeenCalled()
    expect(verdict).not.toHaveBeenCalled()
    watcher.watch('/repo/a', 's2')
    watcher.watchAdditionalDir('/repo/a/', 's3')
    expect(send).toHaveBeenCalledTimes(3)
    expect(send).toHaveBeenCalledWith('agent:conflicts', { sessionId: 's2', conflicts: ['conflict.txt'] })
    expect(branchChanged).toHaveBeenCalledExactlyOnceWith('s2', 'main')
    expect(verdict).toHaveBeenCalledExactlyOnceWith('/repo/a', 's2', expect.any(Function), false)
    watcher.watchAdditionalDir('/repo/a', 's3')
    await vi.advanceTimersByTimeAsync(0)
    expect(send).toHaveBeenCalledTimes(3)
    expect(git.calls).toHaveLength(1)
    send.mockClear()
    await vi.advanceTimersByTimeAsync(2000)
    expect(git.calls).toHaveLength(2)
    expect(send).not.toHaveBeenCalled()
  })

  it('replays a clean cached checkout and reads the branch when its first primary joins', async () => {
    git.status = ''
    watcher.watchAdditionalDir('/repo/a', 's1')
    await vi.advanceTimersByTimeAsync(0)
    send.mockClear()
    watcher.watch('/repo/a', 's2')
    expect(send).toHaveBeenCalledWith('files:changed', { sessionId: 's2', changes: [] })
    expect(verdict).toHaveBeenCalledExactlyOnceWith('/repo/a', 's2', expect.any(Function), false)
    expect(git.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(branchChanged).toHaveBeenCalledExactlyOnceWith('s2', 'main')
  })

  it('keeps tree notifications alive until the final primary or additional consumer leaves', async () => {
    watcher.watch('/repo/a', 's1')
    watcher.watch('/repo/a', 's2')
    watcher.watchAdditionalDir('/repo/a/', 's3')
    await vi.advanceTimersByTimeAsync(0)
    send.mockClear()
    tree.listener?.('s1', '/repo/a')
    expect(send).toHaveBeenCalledWith('files:tree-changed', { sessionId: 's1', rootPath: '/repo/a' })
    expect(send).toHaveBeenCalledWith('files:tree-changed', { sessionId: 's2', rootPath: '/repo/a' })
    expect(send).toHaveBeenCalledWith('files:tree-changed', { sessionId: 's3', rootPath: '/repo/a', source: '/repo/a/' })
    expect(tree.watches).toEqual(['/repo/a'])
    await watcher.unwatch('/repo/a/', 'unknown')
    await watcher.unwatch('/repo/a/', 's1')
    expect(tree.roots.has('/repo/a')).toBe(true)
    send.mockClear()
    git.status = ''
    await vi.advanceTimersByTimeAsync(2000)
    expect(send.mock.calls.map(([, payload]) => payload.sessionId)).toEqual(['s2', 's2', 's3'])
    await watcher.unwatch('/repo/a', 's2')
    expect(tree.roots.has('/repo/a')).toBe(true)
    send.mockClear()
    tree.listener?.('s1', '/repo/a')
    expect(send).toHaveBeenCalledExactlyOnceWith('files:tree-changed', {
      sessionId: 's3', rootPath: '/repo/a', source: '/repo/a/',
    })
    git.status = '?? new.txt\n'
    send.mockClear()
    await vi.advanceTimersByTimeAsync(2000)
    expect(send).toHaveBeenCalledExactlyOnceWith('files:changed', {
      sessionId: 's3', source: '/repo/a/', changes: [{ path: 'new.txt', type: 'added' }],
    })
    await watcher.unwatchAdditionalDir('/repo/a', 's3')
    expect(tree.roots.size).toBe(0)
    const calls = git.calls.length
    await vi.advanceTimersByTimeAsync(4000)
    expect(git.calls).toHaveLength(calls)
    tree.listener?.('s1', '/repo/a')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('removes additional subscribers independently and stops only the last one', async () => {
    watcher.watchAdditionalDir('/repo/a/', 's1')
    watcher.watchAdditionalDir('/repo/a', 's2')
    watcher.watchAdditionalDir('/repo/a/', 's1')
    expect(tree.watches).toEqual(['/repo/a'])
    await vi.advanceTimersByTimeAsync(0)
    watcher.unwatchAdditionalDir('/repo/a/', 'unknown')
    watcher.unwatchAdditionalDir('/repo/a', 's1')
    expect(tree.roots.has('/repo/a')).toBe(true)
    send.mockClear()
    git.status = ''
    await vi.advanceTimersByTimeAsync(2000)
    expect(send).toHaveBeenCalledExactlyOnceWith('files:changed', { sessionId: 's2', source: '/repo/a', changes: [] })
    await watcher.unwatchAdditionalDir('/repo/a/', 's2')
    expect(tree.roots.size).toBe(0)
    await vi.advanceTimersByTimeAsync(6000)
    expect(git.calls).toHaveLength(2)
  })

  it('shares a tree watcher when an additional directory gains and loses a primary', async () => {
    watcher.watchAdditionalDir('/repo/a/', 's1')
    watcher.watch('/repo/a', 's2')
    expect(tree.watches).toEqual(['/repo/a'])
    await watcher.unwatchAdditionalDir('/repo/a', 's1')
    expect(tree.roots.has('/repo/a')).toBe(true)
    send.mockClear()
    tree.listener?.('s1', '/repo/a')
    expect(send).toHaveBeenCalledExactlyOnceWith('files:tree-changed', { sessionId: 's2', rootPath: '/repo/a' })
    await watcher.unwatch('/repo/a')
    expect(tree.roots.size).toBe(0)
  })

  it('polls distinct checkouts independently and clears every timer on unwatchAll', async () => {
    watcher.watch('/repo/a', 's1')
    watcher.watchAdditionalDir('/repo/b', 's1')
    await vi.advanceTimersByTimeAsync(2000)
    expect(git.calls).toEqual(['/repo/a', '/repo/b', '/repo/a', '/repo/b'])
    await watcher.unwatchAll()
    await vi.advanceTimersByTimeAsync(4000)
    expect(git.calls).toHaveLength(4)
  })
})
