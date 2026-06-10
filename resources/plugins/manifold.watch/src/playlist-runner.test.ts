import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { runWatchPlaylist } from './playlist-runner'
import type { AgentPort } from './playlist-runner'
import { DEFAULT_WATCH_QUESTION } from './runner'
import type { TranscriptionSettings } from './shared-types'

const pipelineMock = vi.fn()
vi.mock('./pipeline', () => ({
  runWatchPipeline: (...args: unknown[]) => pipelineMock(...args),
}))

interface FakeSibling {
  sessionId: string
  sendText: ReturnType<typeof vi.fn>
  whenReady: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
}

interface FakeAgents {
  getStatus: ReturnType<typeof vi.fn>
  spawnSibling: ReturnType<typeof vi.fn>
  sendText: ReturnType<typeof vi.fn>
  whenReady: ReturnType<typeof vi.fn>
  /** Chronological [sessionId, text] log across the meta agent and all siblings. */
  inputs: Array<[string, string]>
  /** Handles returned by spawnSibling, in spawn order. */
  siblings: FakeSibling[]
}

function makeAgents(opts: {
  baseStatus?: 'running' | 'waiting' | 'done' | 'error' | 'missing'
  /** 1-based spawn call index at which spawnSibling starts throwing. */
  spawnFailsAt?: number
  onInput?: (sessionId: string, text: string) => void
} = {}): FakeAgents {
  const { baseStatus = 'waiting', spawnFailsAt, onInput } = opts
  const inputs: Array<[string, string]> = []
  const siblings: FakeSibling[] = []
  const record = (sessionId: string, text: string): void => {
    inputs.push([sessionId, text])
    onInput?.(sessionId, text)
  }
  let n = 0
  return {
    inputs,
    siblings,
    getStatus: vi.fn(async () => baseStatus),
    spawnSibling: vi.fn(async () => {
      n++
      if (spawnFailsAt !== undefined && n >= spawnFailsAt) throw new Error('spawn boom')
      const sessionId = `sib-${n}`
      const sibling: FakeSibling = {
        sessionId,
        sendText: vi.fn(async (text: string) => { record(sessionId, text) }),
        // Spawned siblings are treated as "TUI ready" so the runner's
        // ready-wait resolves immediately.
        whenReady: vi.fn(async () => true),
        kill: vi.fn(async () => undefined),
      }
      siblings.push(sibling)
      return sibling
    }),
    sendText: vi.fn(async (sessionId: string, text: string) => { record(sessionId, text) }),
    whenReady: vi.fn(async () => true),
  }
}

const transcription: TranscriptionSettings = { provider: 'none' }

function makeDeps(agents: FakeAgents) {
  return { agents: agents as unknown as AgentPort, getTranscription: vi.fn(async () => transcription) }
}

let tmpAggregatesRoot: string
let tmpWorkRoot: string

beforeEach(() => {
  pipelineMock.mockReset()
  tmpAggregatesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-watch-aggs-'))
  tmpWorkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-watch-runs-'))
})

afterEach(() => {
  fs.rmSync(tmpAggregatesRoot, { recursive: true, force: true })
  fs.rmSync(tmpWorkRoot, { recursive: true, force: true })
})

const RUN_ID = 'test-run'

function runOpts(overrides: Partial<Parameters<typeof runWatchPlaylist>[1]> = {}) {
  return {
    sessionId: 'base',
    entries: [],
    aggregatesRoot: tmpAggregatesRoot,
    workRoot: tmpWorkRoot,
    runId: RUN_ID,
    ...overrides,
  }
}

describe('runWatchPlaylist', () => {
  it('spawns one sibling per entry, primes meta, and instructs each sibling to save its answer', async () => {
    const agents = makeAgents()
    pipelineMock.mockImplementation(async ({ source }: { source: string }) => ({
      workDir: `/tmp/wd-${source.slice(-1)}`,
      reportPath: '/tmp/r.md',
      frames: [],
      transcript: { source: 'none' },
    }))

    const deps = makeDeps(agents)
    const result = await runWatchPlaylist(
      deps,
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

    // Transcription settings are resolved exactly once per run.
    expect(deps.getTranscription).toHaveBeenCalledTimes(1)

    const inputs = agents.inputs

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
    const agents = makeAgents({ baseStatus: 'missing' })
    const r = await runWatchPlaylist(
      makeDeps(agents),
      runOpts({ entries: [{ url: 'https://x/1' }] }),
    )
    expect(r).toEqual({ ok: false, error: 'Session not found' })
    expect(agents.spawnSibling).not.toHaveBeenCalled()
  })

  it('rejects when entries is empty', async () => {
    const agents = makeAgents()
    const r = await runWatchPlaylist(
      makeDeps(agents),
      runOpts({ entries: [] }),
    )
    expect(r.ok).toBe(false)
    expect(agents.spawnSibling).not.toHaveBeenCalled()
  })

  it('rejects when the base session is not running', async () => {
    const agents = makeAgents({ baseStatus: 'done' })
    const r = await runWatchPlaylist(
      makeDeps(agents),
      runOpts({ entries: [{ url: 'https://x/1' }] }),
    )
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not running/)
  })

  it('returns the partial spawnedSessionIds when a sibling spawn fails', async () => {
    const agents = makeAgents({ spawnFailsAt: 1 })
    const r = await runWatchPlaylist(
      makeDeps(agents),
      runOpts({ entries: [{ url: 'https://x/1' }] }),
    )
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/spawn boom/)
  })

  it('kills already-spawned siblings when a later sibling spawn fails', async () => {
    const agents = makeAgents({ spawnFailsAt: 2 })
    const r = await runWatchPlaylist(
      makeDeps(agents),
      runOpts({ entries: [{ url: 'https://x/1' }, { url: 'https://x/2' }] }),
    )
    expect(r.ok).toBe(false)
    // The first sibling (sib-1) was already spawned and must be killed.
    expect(agents.siblings[0].kill).toHaveBeenCalled()
  })

  it('kills the sibling session when its pipeline fails', async () => {
    const agents = makeAgents()
    pipelineMock.mockRejectedValueOnce(new Error('yt-dlp boom'))
    const r = await runWatchPlaylist(
      makeDeps(agents),
      runOpts({ entries: [{ url: 'https://x/1' }] }),
    )
    expect(r.ok).toBe(true)
    expect(r.entryResults![0]).toMatchObject({ ok: false, error: expect.stringMatching(/yt-dlp boom/) })
    // Orphaned sibling must be killed since it never received /watch context.
    expect(agents.siblings[0].kill).toHaveBeenCalled()
  })

  it('reveals each sibling via onEntrySpawned only after its /watch:watch command is sent', async () => {
    const events: Array<{ kind: 'input' | 'spawned'; payload: string }> = []
    const agents = makeAgents({
      onInput: (sid, val) => events.push({ kind: 'input', payload: `${sid}:${val}` }),
    })
    pipelineMock.mockImplementation(async ({ source }: { source: string }) => ({
      workDir: `/tmp/wd-${source.slice(-1)}`,
      reportPath: '',
      frames: [],
      transcript: { source: 'none' },
    }))

    await runWatchPlaylist(
      makeDeps(agents),
      runOpts({
        entries: [{ url: 'https://x/1' }],
        onEntrySpawned: (idx, sid) => events.push({ kind: 'spawned', payload: `${idx}:${sid}` }),
      }),
    )

    // The slash command must be observed *before* onEntrySpawned fires —
    // otherwise the renderer would surface "Open agent" on an empty agent.
    const cmdIndex = events.findIndex((e) =>
      e.kind === 'input' && e.payload.startsWith('sib-1:/watch:watch'),
    )
    const spawnedIndex = events.findIndex((e) => e.kind === 'spawned')
    expect(cmdIndex).toBeGreaterThanOrEqual(0)
    expect(spawnedIndex).toBeGreaterThan(cmdIndex)
  })

  it('records per-entry pipeline failures without aborting the run', async () => {
    const agents = makeAgents()
    pipelineMock
      .mockResolvedValueOnce({ workDir: '/tmp/ok', reportPath: '', frames: [], transcript: { source: 'none' } })
      .mockRejectedValueOnce(new Error('yt-dlp boom'))
    const r = await runWatchPlaylist(
      makeDeps(agents),
      runOpts({ entries: [{ url: 'https://x/1' }, { url: 'https://x/2' }] }),
    )
    expect(r.ok).toBe(true)
    const entryResults = r.entryResults!
    expect(entryResults[0]).toMatchObject({ ok: true, workDir: '/tmp/ok' })
    expect(entryResults[1]).toMatchObject({ ok: false, error: expect.stringMatching(/yt-dlp boom/) })
  })
})
