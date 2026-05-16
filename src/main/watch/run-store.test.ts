import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { WatchRunStore } from './run-store'
import type { AgentSession } from '../../shared/types'

let tmpDir: string
let stateFile: string

function session(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'base',
    projectId: 'proj',
    runtimeId: 'claude',
    branchName: 'manifold/oslo',
    worktreePath: '/repo/.manifold/worktrees/oslo',
    status: 'waiting',
    pid: 1,
    additionalDirs: [],
    ...overrides,
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-run-store-'))
  stateFile = path.join(tmpDir, 'watch-runs.json')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('WatchRunStore', () => {
  it('persists url, siblings, and frames by worktree-backed session key', () => {
    const store = new WatchRunStore(stateFile)
    const base = session()
    store.setUrl(base, 'https://playlist')
    store.startRun(base, {
      runId: 'run-1',
      sourceUrl: 'https://playlist',
      aggregateDir: '/tmp/aggs/run-1',
      entries: [{ url: 'https://video/a', originalIndex: 2, title: 'A' }],
    })
    store.markEntrySpawned('run-1', 2, 'sib-1')
    store.markEntryFrames('run-1', 2, [{ path: '/tmp/manifold-watch-a/frame.jpg', timestampSeconds: 3 }])
    store.markEntryReady('run-1', 2, '/tmp/manifold-watch-a')

    const reloaded = new WatchRunStore(stateFile)
    const snapshot = reloaded.getSnapshot(session({ id: 'rediscovered' }), (id) => id === 'sib-1')

    expect(snapshot.url).toBe('https://playlist')
    expect(snapshot.siblingByIndex).toEqual({ 2: 'sib-1' })
    expect(snapshot.playlistFrames[2][0].timestampSeconds).toBe(3)
    expect(snapshot.playlistDispatched).toBe(true)
  })

  it('filters sibling ids that are no longer live while keeping frames', () => {
    const store = new WatchRunStore(stateFile)
    const base = session()
    store.startRun(base, {
      runId: 'run-1',
      sourceUrl: 'https://playlist',
      aggregateDir: '/tmp/aggs/run-1',
      entries: [{ url: 'https://video/a', originalIndex: 0 }],
    })
    store.markEntrySpawned('run-1', 0, 'stale-sib')
    store.markEntryFrames('run-1', 0, [{ path: '/tmp/manifold-watch-a/frame.jpg', timestampSeconds: 1 }])

    const snapshot = store.getSnapshot(base, () => false)

    expect(snapshot.siblingByIndex).toEqual({})
    expect(snapshot.playlistFrames[0]).toHaveLength(1)
    expect(snapshot.playlistDispatched).toBe(false)
  })
})
