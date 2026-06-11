import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { WatchRunStore } from './run-store'
import type { WatchSessionInfo } from './run-store'

let tmpDir: string
let stateFile: string

function session(overrides: Partial<WatchSessionInfo> = {}): WatchSessionInfo {
  return {
    id: 'base',
    projectId: 'proj',
    worktreePath: '/repo/.manifold/worktrees/oslo',
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

  it('evicts oldest runs and removes their on-disk dirs once the cap is exceeded', () => {
    const store = new WatchRunStore(stateFile)
    const base = session()
    const runDirs: string[] = []
    // Start 25 runs on the same session. Each new startRun overwrites
    // activeRunId, so all prior runs become non-active and evictable.
    for (let i = 0; i < 25; i++) {
      const runId = `run-${String(i).padStart(2, '0')}`
      const aggregateDir = path.join(tmpDir, 'aggs', runId)
      fs.mkdirSync(aggregateDir, { recursive: true })
      fs.writeFileSync(path.join(aggregateDir, 'marker.txt'), 'x')
      runDirs.push(aggregateDir)
      store.startRun(base, {
        runId,
        sourceUrl: `https://video/${i}`,
        aggregateDir,
        entries: [{ url: `https://video/${i}` }],
      })
    }

    // First 5 runs (oldest non-active) should have been evicted from disk.
    for (let i = 0; i < 5; i++) {
      expect(fs.existsSync(runDirs[i])).toBe(false)
    }
    // The remaining (newest 20) should still exist.
    for (let i = 5; i < 25; i++) {
      expect(fs.existsSync(runDirs[i])).toBe(true)
    }
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
