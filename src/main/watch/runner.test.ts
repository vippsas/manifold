import { describe, it, expect, vi } from 'vitest'
import { runWatch } from './runner'
import type { SessionManager } from '../session/session-manager'

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

describe('runWatch', () => {
  it('writes /watch <url> <q>\\r into PTY when session running', () => {
    const sm = makeSm(true)
    const r = runWatch(sm as unknown as SessionManager, 's1', 'https://x', 'why?')
    expect(r).toEqual({ ok: true })
    expect(sm.sendInput).toHaveBeenCalledWith('s1', '/watch https://x why?\r')
  })

  it('omits question when undefined', () => {
    const sm = makeSm(true)
    runWatch(sm as unknown as SessionManager, 's1', 'https://x')
    expect(sm.sendInput).toHaveBeenCalledWith('s1', '/watch https://x\r')
  })

  it('rejects when no session', () => {
    const sm = makeSm(false)
    expect(runWatch(sm as unknown as SessionManager, 's1', 'x')).toEqual({ ok: false, error: 'Session not found' })
  })

  it('rejects empty url', () => {
    const sm = makeSm(true)
    expect(runWatch(sm as unknown as SessionManager, 's1', '   ')).toEqual({ ok: false, error: 'URL is required' })
    expect(sm.sendInput).not.toHaveBeenCalled()
  })

  it('rejects when session not running', () => {
    const sm = makeSm(true, 'done')
    expect(runWatch(sm as unknown as SessionManager, 's1', 'x')).toEqual({ ok: false, error: 'Session is not running' })
  })

  it('accepts waiting status', () => {
    const sm = makeSm(true, 'waiting')
    expect(runWatch(sm as unknown as SessionManager, 's1', 'x')).toEqual({ ok: true })
  })

  it('returns error message when sendInput throws', () => {
    const sm = makeSm(true)
    sm.sendInput.mockImplementationOnce(() => { throw new Error('PTY closed') })
    expect(runWatch(sm as unknown as SessionManager, 's1', 'x')).toEqual({ ok: false, error: 'PTY closed' })
  })
})
