import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runWatch } from './runner'
import type { SessionManager } from '../session/session-manager'
import type { TranscriptionSettings } from '../../shared/watch-types'

const pipelineMock = vi.fn()
vi.mock('./pipeline', () => ({
  runWatchPipeline: (...args: unknown[]) => pipelineMock(...args),
}))

interface FakeSm {
  getSession: ReturnType<typeof vi.fn>
  sendInput: ReturnType<typeof vi.fn>
}

function makeSm(present: boolean, status: 'running' | 'waiting' | 'done' = 'running'): FakeSm {
  return {
    getSession: vi.fn(() => present ? { id: 's1', status } : undefined),
    sendInput: vi.fn(),
  }
}

const transcription: TranscriptionSettings = { provider: 'none' }

beforeEach(() => { pipelineMock.mockReset() })

describe('runWatch', () => {
  it('runs the pipeline and writes /watch:watch <workdir> into the PTY', async () => {
    const sm = makeSm(true)
    pipelineMock.mockResolvedValueOnce({
      workDir: '/tmp/watch-abc',
      reportPath: '/tmp/watch-abc/report.md',
      frames: [
        { path: '/tmp/watch-abc/frames/frame_0001.jpg', timestampSeconds: 0 },
        { path: '/tmp/watch-abc/frames/frame_0002.jpg', timestampSeconds: 5 },
      ],
      transcript: { source: 'captions' },
    })
    const result = await runWatch(
      { sessionManager: sm as unknown as SessionManager, getTranscription: () => transcription },
      { sessionId: 's1', source: 'https://x', question: 'why?' },
    )
    expect(result.ok).toBe(true)
    expect(result.workDir).toBe('/tmp/watch-abc')
    expect(result.frameCount).toBe(2)
    expect(result.frames).toEqual([
      { path: '/tmp/watch-abc/frames/frame_0001.jpg', timestampSeconds: 0 },
      { path: '/tmp/watch-abc/frames/frame_0002.jpg', timestampSeconds: 5 },
    ])
    expect(sm.sendInput).toHaveBeenCalledWith('s1', '/watch:watch "/tmp/watch-abc" why?\r')
  })

  it('omits the question when not provided', async () => {
    const sm = makeSm(true)
    pipelineMock.mockResolvedValueOnce({
      workDir: '/tmp/wd',
      reportPath: '/tmp/wd/report.md',
      frames: [],
      transcript: { source: 'none' },
    })
    await runWatch(
      { sessionManager: sm as unknown as SessionManager, getTranscription: () => transcription },
      { sessionId: 's1', source: 'https://x' },
    )
    expect(sm.sendInput).toHaveBeenCalledWith('s1', '/watch:watch "/tmp/wd"\r')
  })

  it('rejects when no session', async () => {
    const sm = makeSm(false)
    const r = await runWatch(
      { sessionManager: sm as unknown as SessionManager, getTranscription: () => transcription },
      { sessionId: 's1', source: 'x' },
    )
    expect(r).toEqual({ ok: false, error: 'Session not found' })
    expect(pipelineMock).not.toHaveBeenCalled()
  })

  it('rejects empty source without running pipeline', async () => {
    const sm = makeSm(true)
    const r = await runWatch(
      { sessionManager: sm as unknown as SessionManager, getTranscription: () => transcription },
      { sessionId: 's1', source: '   ' },
    )
    expect(r).toEqual({ ok: false, error: 'Source is required' })
    expect(pipelineMock).not.toHaveBeenCalled()
  })

  it('rejects when session is not running', async () => {
    const sm = makeSm(true, 'done')
    const r = await runWatch(
      { sessionManager: sm as unknown as SessionManager, getTranscription: () => transcription },
      { sessionId: 's1', source: 'x' },
    )
    expect(r).toEqual({ ok: false, error: 'Session is not running' })
  })

  it('returns pipeline error when the pipeline rejects', async () => {
    const sm = makeSm(true)
    pipelineMock.mockRejectedValueOnce(new Error('yt-dlp missing'))
    const r = await runWatch(
      { sessionManager: sm as unknown as SessionManager, getTranscription: () => transcription },
      { sessionId: 's1', source: 'https://x' },
    )
    expect(r).toEqual({ ok: false, error: 'yt-dlp missing' })
  })

  it('returns PTY error but keeps workDir when sendInput throws', async () => {
    const sm = makeSm(true)
    sm.sendInput.mockImplementationOnce(() => { throw new Error('PTY closed') })
    pipelineMock.mockResolvedValueOnce({
      workDir: '/tmp/wd',
      reportPath: '/tmp/wd/report.md',
      frames: [],
      transcript: { source: 'none' },
    })
    const r = await runWatch(
      { sessionManager: sm as unknown as SessionManager, getTranscription: () => transcription },
      { sessionId: 's1', source: 'x' },
    )
    expect(r.ok).toBe(false)
    expect(r.error).toBe('PTY closed')
    expect(r.workDir).toBe('/tmp/wd')
  })
})
