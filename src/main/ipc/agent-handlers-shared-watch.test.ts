import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type { PtyPool } from '../agent/pty-pool'
import type { InternalSession } from '../session/session-types'
import { FileWatcher } from '../fs/file-watcher'
import { SessionKiller } from '../session/session-killer'
import { registerAgentHandlers } from './agent-handlers'

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs/promises')>(),
  stat: vi.fn(async () => ({ isDirectory: () => false, mtimeMs: 1, size: 1 })),
}))

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => Promise<unknown>>())
vi.mock('electron', () => ({ ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => Promise<unknown>) => {
  handlers.set(channel, fn)
} } }))

let watcher: FileWatcher

afterEach(async () => {
  await watcher?.unwatchAll()
  vi.useRealTimers()
  handlers.clear()
})

describe('agent:spawn shared checkout cleanup', () => {
  it('clears a finished in-place session while a running sibling keeps receiving updates', async () => {
    vi.useFakeTimers()
    let status = ''
    const send = vi.fn()
    watcher = new FileWatcher(async () => status, undefined, undefined, async () => 'main')
    watcher.setMainWindow({ isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow)
    const sessions = new Map(['h1', 'h2'].map((id) => [id, {
      id, projectId: 'p1', noWorktree: true, worktreePath: '/repo',
      status: id === 'h1' ? 'running' : 'done', ptyId: '', additionalDirs: [], checkoutWatched: true,
    } as unknown as InternalSession]))
    for (const id of sessions.keys()) watcher.watch('/repo', id)
    await vi.advanceTimersByTimeAsync(0)
    const killer = new SessionKiller({
      sessions, ptyPool: { kill: () => {} } as unknown as PtyPool,
      getFileWatcher: () => watcher, getMemoryCapture: () => null, getChatAdapter: () => null,
      notifySessionsChanged: () => {},
    })
    registerAgentHandlers({
      projectRegistry: { getProject: () => ({ id: 'p1', path: '/repo' }) },
      fileWatcher: watcher,
      sessionManager: {
        listSessions: () => [...sessions.values()],
        getInternalSession: (id: string) => sessions.get(id),
        killSession: (id: string) => killer.killSession(id),
        createSession: async () => ({ id: 'new-session' }),
      },
    } as never)

    await handlers.get('agent:spawn')!({}, { projectId: 'p1', runtimeId: 'codex' })
    expect(sessions.has('h2')).toBe(false)
    expect(sessions.has('h1')).toBe(true)
    send.mockClear()
    status = '?? live.txt\n'
    await vi.advanceTimersByTimeAsync(2000)
    expect(send).toHaveBeenCalledWith('files:changed', {
      sessionId: 'h1', changes: [{ path: 'live.txt', type: 'added' }],
    })
    expect(send.mock.calls.every(([, payload]) => payload.sessionId === 'h1')).toBe(true)
  })
})
