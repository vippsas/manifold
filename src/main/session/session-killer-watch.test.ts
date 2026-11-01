import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type { PtyPool } from '../agent/pty-pool'
import { FileWatcher } from '../fs/file-watcher'
import { SessionKiller } from './session-killer'
import type { InternalSession } from './session-types'

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  stat: vi.fn(async () => ({ isDirectory: () => false, mtimeMs: 1, size: 1 })),
}))

class FakeTreeWatcher {
  roots = new Set<string>()
  listener?: (id: string, root: string) => void
  watch(root: string): void { this.roots.add(root) }
  async unwatch(root: string): Promise<void> { this.roots.delete(root) }
  async unwatchAll(): Promise<void> { this.roots.clear() }
  setOnTreeChanged(fn: (id: string, root: string) => void): void { this.listener = fn }
}

let watcher: FileWatcher

beforeEach(() => { vi.useFakeTimers() })
afterEach(async () => {
  await watcher.unwatchAll()
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})

it('killing a dormant session preserves its live sibling primary, add-dir and tree subscriptions', async () => {
  const tree = new FakeTreeWatcher()
  const send = vi.fn()
  let status = ''
  const readStatus = vi.fn(async (_cwd: string) => status)
  watcher = new FileWatcher(readStatus, tree, async () => '', async () => 'main')
  watcher.setMainWindow({ isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow)
  const live = {
    id: 'live', projectId: 'project', worktreePath: '/repo/a', additionalDirs: ['/repo/additional'],
    checkoutWatched: true, ptyId: '',
  } as InternalSession
  const dormant = { ...live, id: 'dormant', checkoutWatched: false }
  const sessions = new Map([[live.id, live], [dormant.id, dormant]])
  const killer = new SessionKiller({
    sessions,
    ptyPool: {} as PtyPool,
    getFileWatcher: () => watcher,
    getMemoryCapture: () => null,
    getChatAdapter: () => null,
    notifySessionsChanged: () => {},
  })
  watcher.watch(live.worktreePath, live.id)
  watcher.watchAdditionalDir(live.additionalDirs[0], live.id)
  await vi.advanceTimersByTimeAsync(0)
  send.mockClear()

  await killer.killSession(dormant.id)
  expect(sessions.has(dormant.id)).toBe(false)
  expect(sessions.has(live.id)).toBe(true)
  expect(tree.roots.has('/repo/a')).toBe(true)
  expect(vi.getTimerCount()).toBe(2)
  status = '?? new.txt\n'
  await vi.advanceTimersByTimeAsync(2000)
  expect(readStatus.mock.calls).toEqual([['/repo/a'], ['/repo/additional'], ['/repo/a'], ['/repo/additional']])
  expect(send).toHaveBeenCalledWith('files:changed', {
    sessionId: live.id, changes: [{ path: 'new.txt', type: 'added' }],
  })
  expect(send).toHaveBeenCalledWith('files:changed', {
    sessionId: live.id, source: '/repo/additional', changes: [{ path: 'new.txt', type: 'added' }],
  })
  expect(send.mock.calls.every(([, payload]) => payload.sessionId === live.id)).toBe(true)
  send.mockClear()
  tree.listener?.(dormant.id, live.worktreePath)
  expect(send).toHaveBeenCalledExactlyOnceWith('files:tree-changed', { sessionId: live.id, rootPath: live.worktreePath })

  await killer.killSession(live.id)
  expect(tree.roots.size).toBe(0)
  expect(vi.getTimerCount()).toBe(0)
})
