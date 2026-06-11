import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { WatchRunStore } from './run-store'
import type { WatchSessionInfo } from './run-store'

let tmpDir: string
let stateFile: string
let runsRoot: string

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
  runsRoot = path.join(tmpDir, 'watch-runs')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('WatchRunStore', () => {
  it('persists url and run state by worktree-backed session key', () => {
    const store = new WatchRunStore(stateFile, runsRoot)
    const base = session()
    store.setUrl(base, 'https://video/a')
    store.startRun(base, { runId: 'run-1', sourceUrl: 'https://video/a', question: 'why?' })
    store.markFrames('run-1', [{ path: '/tmp/manifold-watch-a/frame.jpg', timestampSeconds: 3 }])
    store.markReady('run-1', '/tmp/manifold-watch-a')

    const reloaded = new WatchRunStore(stateFile, runsRoot)
    const snapshot = reloaded.getSnapshot(session({ id: 'rediscovered' }))

    expect(snapshot.url).toBe('https://video/a')
    expect(snapshot.run).toMatchObject({
      runId: 'run-1',
      status: 'ready',
      workDir: '/tmp/manifold-watch-a',
      question: 'why?',
    })
    expect(snapshot.run!.frames[0].timestampSeconds).toBe(3)
  })

  it('returns a null run when the session url no longer matches the active run', () => {
    const store = new WatchRunStore(stateFile, runsRoot)
    const base = session()
    store.startRun(base, { runId: 'run-1', sourceUrl: 'https://video/a' })
    store.setUrl(base, 'https://video/b')

    const snapshot = store.getSnapshot(base)
    expect(snapshot.url).toBe('https://video/b')
    expect(snapshot.run).toBeNull()
  })

  it('records pipeline failures as an error run', () => {
    const store = new WatchRunStore(stateFile, runsRoot)
    const base = session()
    store.startRun(base, { runId: 'run-1', sourceUrl: 'https://video/a' })
    store.markError('run-1', 'yt-dlp boom')

    const snapshot = store.getSnapshot(base)
    expect(snapshot.run).toMatchObject({ status: 'error', error: 'yt-dlp boom' })
  })

  it('evicts oldest runs and removes their on-disk dirs once the cap is exceeded', () => {
    const store = new WatchRunStore(stateFile, runsRoot)
    const base = session()
    const runDirs: string[] = []
    // Start 25 runs on the same session. Each new startRun overwrites
    // activeRunId, so all prior runs become non-active and evictable.
    for (let i = 0; i < 25; i++) {
      const runId = `run-${String(i).padStart(2, '0')}`
      const runDir = path.join(runsRoot, runId)
      fs.mkdirSync(runDir, { recursive: true })
      fs.writeFileSync(path.join(runDir, 'marker.txt'), 'x')
      runDirs.push(runDir)
      store.startRun(base, { runId, sourceUrl: `https://video/${i}` })
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

  it('drops runs written by the retired playlist format (and their frame dirs) on load', () => {
    const oldFormat = {
      sessions: {
        '/repo/.manifold/worktrees/oslo': {
          key: '/repo/.manifold/worktrees/oslo',
          ownerSessionId: 'base',
          ownerWorktreePath: '/repo/.manifold/worktrees/oslo',
          url: 'https://playlist',
          activeRunId: 'old-run',
        },
      },
      runs: {
        'old-run': {
          runId: 'old-run',
          key: '/repo/.manifold/worktrees/oslo',
          sourceUrl: 'https://playlist',
          aggregateDir: '/tmp/aggs/old-run',
          entries: [{ url: 'https://video/a', originalIndex: 0, frames: [], status: 'ready' }],
        },
      },
    }
    fs.writeFileSync(stateFile, JSON.stringify(oldFormat))
    const oldRunDir = path.join(runsRoot, 'old-run')
    fs.mkdirSync(oldRunDir, { recursive: true })

    const store = new WatchRunStore(stateFile, runsRoot)
    const snapshot = store.getSnapshot(session())

    // The session url survives; the unparseable run does not.
    expect(snapshot.url).toBe('https://playlist')
    expect(snapshot.run).toBeNull()
    expect(fs.existsSync(oldRunDir)).toBe(false)
  })
})
