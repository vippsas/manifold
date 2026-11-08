import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type { VerdictRecorder } from '../session/verdict-recorder'
import { FileWatcher } from './file-watcher'
import { VerdictPollForwarder } from './verdict-poll-forwarder'

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  stat: vi.fn(async () => ({ isDirectory: () => false, mtimeMs: 1, size: 1 })),
}))

class FakeTreeWatcher {
  roots = new Set<string>()
  closed: string[] = []
  listener?: (id: string, root: string) => void
  watch(root: string): void { this.roots.add(root) }
  async unwatch(root: string): Promise<void> { this.roots.delete(root); this.closed.push(root) }
  async unwatchAll(): Promise<void> { this.roots.clear() }
  setOnTreeChanged(fn: (id: string, root: string) => void): void { this.listener = fn }
}

class FakeVerdictRecorder {
  commits: string[] = []
  files: string[] = []
  onAgentCommit(id: string): void { this.commits.push(id) }
  onFilesChanged(id: string): void { this.files.push(id) }
  // A known PR prevents the real forwarder from making a live gh request.
  getDetectedPrUrl(): string { return 'https://example.test/pr/1' }
}

let watcher: FileWatcher

beforeEach(() => { vi.useFakeTimers() })
afterEach(async () => {
  await watcher.unwatchAll()
  expect(vi.getTimerCount()).toBe(0)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('evicts primary verdict state while preserving the tree watcher for additional consumers', async () => {
  const tree = new FakeTreeWatcher()
  const recorder = new FakeVerdictRecorder()
  const evict = vi.spyOn(VerdictPollForwarder.prototype, 'evict')
  const send = vi.fn()
  let status = ''
  let head = 'sha-a'
  watcher = new FileWatcher(async () => status, tree, async () => head, async () => 'main')
  watcher.setVerdictRecorder(recorder as unknown as VerdictRecorder)
  watcher.setMainWindow({ isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow)
  watcher.watch('/repo/a', 's1')
  watcher.watch('/repo/a', 's2')
  watcher.watchAdditionalDir('/repo/a', 's3')
  await vi.advanceTimersByTimeAsync(0)

  await watcher.unwatch('/repo/a', 's1')
  expect(evict).toHaveBeenCalledExactlyOnceWith('/repo/a', 's1')
  expect(tree.roots.has('/repo/a')).toBe(true)
  expect(tree.closed).toEqual([])
  head = 'sha-b'
  status = ' M edited.txt\n'
  await vi.advanceTimersByTimeAsync(2000)
  expect(recorder.commits).toEqual(['s2'])
  expect(recorder.files).toEqual(['s2'])
  send.mockClear()
  tree.listener?.('s1', '/repo/a')
  expect(send).toHaveBeenCalledWith('files:tree-changed', { sessionId: 's2', rootPath: '/repo/a' })
  expect(send).toHaveBeenCalledWith('files:tree-changed', { sessionId: 's3', rootPath: '/repo/a', source: '/repo/a' })
  expect(send).toHaveBeenCalledTimes(2)

  // Rejoining starts a fresh HEAD baseline, proving s1's old state was evicted.
  watcher.watch('/repo/a', 's1')
  await vi.advanceTimersByTimeAsync(0)
  expect(recorder.commits).toEqual(['s2'])
  await watcher.unwatch('/repo/a', 's1')
  await watcher.unwatch('/repo/a', 's2')
  expect(evict).toHaveBeenLastCalledWith('/repo/a')
  expect(tree.roots.has('/repo/a')).toBe(true)
  expect(tree.closed).toEqual([])

  send.mockClear()
  tree.listener?.('s2', '/repo/a')
  expect(send).toHaveBeenCalledExactlyOnceWith('files:tree-changed', { sessionId: 's3', rootPath: '/repo/a', source: '/repo/a' })
  send.mockClear()
  head = 'sha-c'
  status = ''
  await vi.advanceTimersByTimeAsync(2000)
  expect(send).toHaveBeenCalledExactlyOnceWith('files:changed', { sessionId: 's3', source: '/repo/a', changes: [] })
  expect(recorder.commits).toEqual(['s2'])
  expect(recorder.files).toEqual(['s2'])

  // The path eviction also discards s2's baseline while the add-dir keeps polling.
  watcher.watch('/repo/a', 's2')
  await vi.advanceTimersByTimeAsync(0)
  expect(recorder.commits).toEqual(['s2'])
})
