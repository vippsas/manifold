import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { runWatchPlaylist } from './playlist-runner'
import { DEFAULT_WATCH_QUESTION } from './runner'
import type { SessionManager } from '../session/session-manager'
import type { TranscriptionSettings } from '../../shared/watch-types'

const pipelineMock = vi.fn()
vi.mock('./pipeline', () => ({
  runWatchPipeline: (...args: unknown[]) => pipelineMock(...args),
}))

interface FakeSm {
  getSession: ReturnType<typeof vi.fn>
  createSession: ReturnType<typeof vi.fn>
  sendInput: ReturnType<typeof vi.fn>
}

function makeSm(opts: {
  baseSessionPresent?: boolean
  baseStatus?: 'running' | 'waiting' | 'done'
  spawnFails?: boolean
} = {}): FakeSm {
  const { baseSessionPresent = true, baseStatus = 'running', spawnFails = false } = opts
  let n = 0
  return {
    getSession: vi.fn((id?: string) => {
      if (id && id.startsWith('sib-')) {
        // Spawned siblings are treated as "TUI ready" so the runner's
        // wait-for-'waiting' check resolves immediately.
        return { id, projectId: 'proj', runtimeId: 'claude', worktreePath: '/wt', status: 'waiting' }
      }
      return baseSessionPresent
        ? { id: 'base', projectId: 'proj', runtimeId: 'claude', worktreePath: '/wt', status: baseStatus === 'running' ? 'waiting' : baseStatus }
        : undefined
    }),
    createSession: vi.fn(async () => {
      if (spawnFails) throw new Error('spawn boom')
      n++
      return { id: `sib-${n}` }
    }),
    sendInput: vi.fn(),
  }
}

const transcription: TranscriptionSettings = { provider: 'none' }

let tmpAggregatesRoot: string

beforeEach(() => {
  pipelineMock.mockReset()
  tmpAggregatesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-watch-aggs-'))
})

afterEach(() => {
  fs.rmSync(tmpAggregatesRoot, { recursive: true, force: true })
})

const RUN_ID = 'test-run'

function runOpts(overrides: Partial<Parameters<typeof runWatchPlaylist>[1]> = {}) {
  return {
    sessionId: 'base',
    entries: [],
    aggregatesRoot: tmpAggregatesRoot,
    runId: RUN_ID,
    ...overrides,
  }
}

describe('runWatchPlaylist', () => {
  it('spawns one sibling per entry, primes meta, and instructs each sibling to save its answer', async () => {
    const sm = makeSm()
    pipelineMock.mockImplementation(async ({ source }: { source: string }) => ({
      workDir: `/tmp/wd-${source.slice(-1)}`,
      reportPath: '/tmp/r.md',
      frames: [],
      transcript: { source: 'none' },
    }))

    const result = await runWatchPlaylist(
      { sessionManager: sm as unknown as SessionManager, getTranscription: () => transcription },
      runOpts({
        entries: [
          { url: 'https://x/1', question: 'why?', title: 'Vid A' },
          { url: 'https://x/2', title: 'Vid B' },
        ],
      }),
    )

    expect(result.ok).toBe(true)
    expect(result.spawnedSessionIds).toEqual(['sib-1', 'sib-2'])
    expect(result.aggregateDir).toBe(path.join(tmpAggregatesRoot, RUN_ID))
    expect(fs.existsSync(result.aggregateDir!)).toBe(true)

    const inputs = sm.sendInput.mock.calls.map((c) => c.slice(0, 2) as [string, string])

    // Primer typed into the base (meta) session, mentioning both titles and the aggregate dir.
    const primer = inputs.find(([sid, val]) => sid === 'base' && val.startsWith('Note:'))
    expect(primer).toBeDefined()
    expect(primer![1]).toContain('Vid A')
    expect(primer![1]).toContain('Vid B')
    expect(primer![1]).toContain(result.aggregateDir!)

    // Each sibling slash command includes the original question and the save instruction.
    const sib1Cmd = inputs.find(([sid, val]) => sid === 'sib-1' && val.startsWith('/watch:watch'))!
    expect(sib1Cmd[1]).toContain('why?')
    expect(sib1Cmd[1]).toContain(`sibling-1.md`)
    expect(sib1Cmd[1]).toContain('Write tool')

    const sib2Cmd = inputs.find(([sid, val]) => sid === 'sib-2' && val.startsWith('/watch:watch'))!
    expect(sib2Cmd[1]).toContain(DEFAULT_WATCH_QUESTION)
    expect(sib2Cmd[1]).toContain(`sibling-2.md`)

    // One Enter per sibling + one Enter for the primer = 3.
    expect(inputs.filter(([, v]) => v === '\r').length).toBe(3)
  })

  it('rejects when the base session is missing', async () => {
    const sm = makeSm({ baseSessionPresent: false })
    const r = await runWatchPlaylist(
      { sessionManager: sm as unknown as SessionManager, getTranscription: () => transcription },
      runOpts({ entries: [{ url: 'https://x/1' }] }),
    )
    expect(r).toEqual({ ok: false, error: 'Session not found' })
    expect(sm.createSession).not.toHaveBeenCalled()
  })

  it('rejects when entries is empty', async () => {
    const sm = makeSm()
    const r = await runWatchPlaylist(
      { sessionManager: sm as unknown as SessionManager, getTranscription: () => transcription },
      runOpts({ entries: [] }),
    )
    expect(r.ok).toBe(false)
    expect(sm.createSession).not.toHaveBeenCalled()
  })

  it('rejects when the base session is not running', async () => {
    const sm = makeSm({ baseStatus: 'done' })
    const r = await runWatchPlaylist(
      { sessionManager: sm as unknown as SessionManager, getTranscription: () => transcription },
      runOpts({ entries: [{ url: 'https://x/1' }] }),
    )
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not running/)
  })

  it('returns the partial spawnedSessionIds when a sibling spawn fails', async () => {
    const sm = makeSm({ spawnFails: true })
    const r = await runWatchPlaylist(
      { sessionManager: sm as unknown as SessionManager, getTranscription: () => transcription },
      runOpts({ entries: [{ url: 'https://x/1' }] }),
    )
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/spawn boom/)
  })

  it('records per-entry pipeline failures without aborting the run', async () => {
    const sm = makeSm()
    pipelineMock
      .mockResolvedValueOnce({ workDir: '/tmp/ok', reportPath: '', frames: [], transcript: { source: 'none' } })
      .mockRejectedValueOnce(new Error('yt-dlp boom'))
    const r = await runWatchPlaylist(
      { sessionManager: sm as unknown as SessionManager, getTranscription: () => transcription },
      runOpts({ entries: [{ url: 'https://x/1' }, { url: 'https://x/2' }] }),
    )
    expect(r.ok).toBe(true)
    const entryResults = r.entryResults!
    expect(entryResults[0]).toMatchObject({ ok: true, workDir: '/tmp/ok' })
    expect(entryResults[1]).toMatchObject({ ok: false, error: expect.stringMatching(/yt-dlp boom/) })
  })
})
