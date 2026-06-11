import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { runWatchVideo } from './video-runner'
import type { AgentPort } from './video-runner'
import { WatchRunStore } from './run-store'
import { DEFAULT_WATCH_QUESTION } from './shared-types'
import type { TranscriptionSettings } from './shared-types'

const pipelineMock = vi.fn()
vi.mock('./pipeline', () => ({
  runWatchPipeline: (...args: unknown[]) => pipelineMock(...args),
}))

interface FakeAgents {
  getStatus: ReturnType<typeof vi.fn>
  sendText: ReturnType<typeof vi.fn>
  whenReady: ReturnType<typeof vi.fn>
  /** Chronological [sessionId, text] log. */
  inputs: Array<[string, string]>
}

function makeAgents(opts: {
  baseStatus?: 'running' | 'waiting' | 'done' | 'error' | 'missing'
} = {}): FakeAgents {
  const { baseStatus = 'waiting' } = opts
  const inputs: Array<[string, string]> = []
  return {
    inputs,
    getStatus: vi.fn(async () => baseStatus),
    sendText: vi.fn(async (sessionId: string, text: string) => { inputs.push([sessionId, text]) }),
    whenReady: vi.fn(async () => true),
  }
}

const transcription: TranscriptionSettings = { provider: 'none' }

function makeDeps(agents: FakeAgents, store?: WatchRunStore) {
  return {
    agents: agents as unknown as AgentPort,
    getTranscription: vi.fn(async () => transcription),
    watchRunStore: store,
  }
}

let tmpDir: string
let tmpWorkRoot: string

beforeEach(() => {
  pipelineMock.mockReset()
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-watch-runner-'))
  tmpWorkRoot = path.join(tmpDir, 'work')
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const RUN_ID = 'test-run'

function runOpts(overrides: Partial<Parameters<typeof runWatchVideo>[1]> = {}) {
  return {
    sessionId: 'base',
    url: 'https://x/1',
    workRoot: tmpWorkRoot,
    runId: RUN_ID,
    ...overrides,
  }
}

describe('runWatchVideo', () => {
  it('runs the pipeline and types the /watch:watch command into the base agent', async () => {
    const agents = makeAgents()
    pipelineMock.mockResolvedValue({
      workDir: '/tmp/wd-1',
      reportPath: '/tmp/r.md',
      frames: [{ path: '/tmp/f1.jpg', timestampSeconds: 2 }],
      transcript: { source: 'none' },
    })

    const deps = makeDeps(agents)
    const result = await runWatchVideo(deps, runOpts({ question: 'why?' }))

    expect(result).toEqual({ ok: true, workDir: '/tmp/wd-1' })
    expect(deps.getTranscription).toHaveBeenCalledTimes(1)

    // The command goes to the base session, waits for its prompt first, and
    // is followed by an Enter keystroke.
    expect(agents.whenReady).toHaveBeenCalledWith('base', expect.any(Number))
    const cmd = agents.inputs.find(([sid, val]) => sid === 'base' && val.startsWith('/watch:watch'))!
    expect(cmd[1]).toContain('"/tmp/wd-1"')
    expect(cmd[1]).toContain('why?')
    expect(agents.inputs.filter(([, v]) => v === '\r').length).toBe(1)
  })

  it('falls back to the default prompt when the question is blank', async () => {
    const agents = makeAgents()
    pipelineMock.mockResolvedValue({ workDir: '/tmp/wd-1', reportPath: '', frames: [], transcript: { source: 'none' } })

    await runWatchVideo(makeDeps(agents), runOpts({ question: '   ' }))

    const cmd = agents.inputs.find(([, val]) => val.startsWith('/watch:watch'))!
    expect(cmd[1]).toContain(DEFAULT_WATCH_QUESTION)
  })

  it('rejects when the base session is missing', async () => {
    const agents = makeAgents({ baseStatus: 'missing' })
    const r = await runWatchVideo(makeDeps(agents), runOpts())
    expect(r).toEqual({ ok: false, error: 'Session not found' })
    expect(pipelineMock).not.toHaveBeenCalled()
  })

  it('rejects when the base session is not running', async () => {
    const agents = makeAgents({ baseStatus: 'done' })
    const r = await runWatchVideo(makeDeps(agents), runOpts())
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not running/)
    expect(pipelineMock).not.toHaveBeenCalled()
  })

  it('reports frames to the store and the onFramesReady hook before the agent command', async () => {
    const events: string[] = []
    const agents = makeAgents()
    agents.sendText.mockImplementation(async (_sid: string, text: string) => { events.push(`input:${text}`) })
    pipelineMock.mockResolvedValue({
      workDir: '/tmp/wd-1',
      reportPath: '',
      frames: [{ path: '/tmp/f1.jpg', timestampSeconds: 2, hdPath: '/tmp/f1-hd.jpg' }],
      transcript: { source: 'none' },
    })
    const store = new WatchRunStore(path.join(tmpDir, 'state.json'), path.join(tmpDir, 'runs'))

    const session = { id: 'base', projectId: 'p', worktreePath: '/wt' }
    await runWatchVideo(
      makeDeps(agents, store),
      runOpts({
        sessionInfo: session,
        // The typed panel URL — the run must be recorded under it, not under
        // the normalized pipeline URL, or snapshots won't re-attach.
        sourceUrl: 'https://typed/1',
        onFramesReady: (frames) => events.push(`frames:${frames.length}`),
      }),
    )

    expect(events[0]).toBe('frames:1')
    expect(events.some((e) => e.startsWith('input:/watch:watch'))).toBe(true)
    const snapshot = store.getSnapshot(session)
    expect(snapshot.url).toBe('https://typed/1')
    expect(snapshot.run).toMatchObject({ runId: RUN_ID, status: 'ready', workDir: '/tmp/wd-1' })
    expect(snapshot.run!.frames).toEqual([{ path: '/tmp/f1.jpg', timestampSeconds: 2, hdPath: '/tmp/f1-hd.jpg' }])
  })

  it('marks the run as errored when the pipeline fails', async () => {
    const agents = makeAgents()
    pipelineMock.mockRejectedValueOnce(new Error('yt-dlp boom'))
    const store = new WatchRunStore(path.join(tmpDir, 'state.json'), path.join(tmpDir, 'runs'))

    const session = { id: 'base', projectId: 'p', worktreePath: '/wt' }
    const r = await runWatchVideo(makeDeps(agents, store), runOpts({ sessionInfo: session }))

    expect(r).toEqual({ ok: false, error: 'yt-dlp boom' })
    expect(agents.sendText).not.toHaveBeenCalled()
    expect(store.getSnapshot(session).run).toMatchObject({ status: 'error', error: 'yt-dlp boom' })
  })

  it('threads the abort signal into the pipeline hooks', async () => {
    const agents = makeAgents()
    let seenSignal: AbortSignal | undefined
    pipelineMock.mockImplementation(async (_opts: unknown, _t: unknown, hooks: { signal?: AbortSignal }) => {
      seenSignal = hooks.signal
      return { workDir: '/tmp/wd-1', reportPath: '', frames: [], transcript: { source: 'none' } }
    })

    const ctrl = new AbortController()
    await runWatchVideo(makeDeps(agents), runOpts({ signal: ctrl.signal }))
    expect(seenSignal).toBe(ctrl.signal)
  })
})
