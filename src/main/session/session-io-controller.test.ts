import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { SessionIoController } from './session-io-controller'
import type { InternalSession } from './session-types'
import type { PtyPool } from '../agent/pty-pool'
import type { ShellSessionController } from './shell-session-controller'

function makeSession(overrides: Partial<InternalSession> = {}): InternalSession {
  return {
    id: 'sess-1',
    projectId: '',
    runtimeId: '__shell__',
    branchName: '',
    worktreePath: '/tmp',
    status: 'running',
    pid: 1234,
    ptyId: 'pty-1',
    outputBuffer: '',
    additionalDirs: [],
    ...overrides,
  } as InternalSession
}

describe('SessionIoController post-interrupt drain', () => {
  let writes: Array<{ ptyId: string; data: string }>
  let ptyPool: PtyPool
  let shellController: ShellSessionController
  let sessions: Map<string, InternalSession>
  let controller: SessionIoController

  beforeEach(() => {
    vi.useFakeTimers()
    writes = []
    sessions = new Map()
    ptyPool = {
      write: (ptyId: string, data: string) => { writes.push({ ptyId, data }) },
    } as unknown as PtyPool
    shellController = {
      handleInput: () => false,
    } as unknown as ShellSessionController

    controller = new SessionIoController({
      sessions,
      ptyPool,
      shellController,
      getMemoryCapture: () => null,
      spawnPrintModeFollowUp: () => {},
      trackActivity: () => {},
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('forwards Ctrl+C immediately for shell sessions', () => {
    const session = makeSession()
    sessions.set(session.id, session)

    controller.sendInput(session.id, '\x03')

    expect(writes).toEqual([{ ptyId: 'pty-1', data: '\x03' }])
  })

  it('buffers input after Ctrl+C and drains with \\r before flushing', () => {
    const session = makeSession()
    sessions.set(session.id, session)

    controller.sendInput(session.id, '\x03')
    controller.sendInput(session.id, '\x1b[A')

    // Buffered — not yet written
    expect(writes.map(w => w.data)).toEqual(['\x03'])

    // After drain delay, \r is written
    vi.advanceTimersByTime(500)
    expect(writes.map(w => w.data)).toEqual(['\x03', '\r'])

    // After post-drain flush delay, buffered input is sent
    vi.advanceTimersByTime(50)
    expect(writes.map(w => w.data)).toEqual(['\x03', '\r', '\x1b[A'])
  })

  it('drains exactly one \\r even when Ctrl+C is sent multiple times', () => {
    const session = makeSession()
    sessions.set(session.id, session)

    controller.sendInput(session.id, '\x03')
    vi.advanceTimersByTime(200)
    controller.sendInput(session.id, '\x03')
    vi.advanceTimersByTime(500)

    const drainCount = writes.filter(w => w.data === '\r').length
    expect(drainCount).toBe(1)
  })

  it('does not arm the drain for non-shell sessions', () => {
    const session = makeSession({ runtimeId: 'claude' })
    sessions.set(session.id, session)

    controller.sendInput(session.id, '\x03')
    controller.sendInput(session.id, '\x1b[A')

    vi.advanceTimersByTime(1000)

    // No \r drain injected; arrow forwarded immediately
    expect(writes.map(w => w.data)).toEqual(['\x03', '\x1b[A'])
  })

  it('does not buffer input when no Ctrl+C is in flight', () => {
    const session = makeSession()
    sessions.set(session.id, session)

    controller.sendInput(session.id, 'hello\r')

    expect(writes).toEqual([{ ptyId: 'pty-1', data: 'hello\r' }])
  })

  it('cleans up pending drain timer when killAllSessions is called', () => {
    const session = makeSession()
    sessions.set(session.id, session)

    controller.sendInput(session.id, '\x03')
    controller.killAllSessions()

    vi.advanceTimersByTime(1000)

    // Only the Ctrl+C — no \r drain because timer was cleared
    expect(writes.map(w => w.data)).toEqual(['\x03'])
  })
})
