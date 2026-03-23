// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ChatAdapter } from '../agent/chat-adapter'
import { SessionStreamWirer } from './session-stream-wirer'
import type { InternalSession } from './session-types'

class FakePtyPool {
  private dataHandlers = new Map<string, Array<(data: string) => void>>()
  private exitHandlers = new Map<string, Array<(code: number) => void>>()

  onData(id: string, handler: (data: string) => void): void {
    this.dataHandlers.set(id, [...(this.dataHandlers.get(id) ?? []), handler])
  }

  onExit(id: string, handler: (code: number) => void): void {
    this.exitHandlers.set(id, [...(this.exitHandlers.get(id) ?? []), handler])
  }

  emitData(id: string, data: string): void {
    for (const handler of this.dataHandlers.get(id) ?? []) handler(data)
  }

  emitExit(id: string, code = 0): void {
    for (const handler of this.exitHandlers.get(id) ?? []) handler(code)
  }
}

function createSession(): InternalSession {
  return {
    id: 'session-1',
    projectId: 'project-1',
    runtimeId: 'codex',
    branchName: 'main',
    worktreePath: '/tmp/app',
    status: 'running',
    pid: 123,
    ptyId: 'pty-1',
    outputBuffer: '',
    additionalDirs: [],
    noWorktree: true,
    nonInteractive: true,
    nonInteractiveOutputMode: 'codex-jsonl',
  }
}

describe('SessionStreamWirer', () => {
  it('does not promote preview URLs mentioned only in assistant text', () => {
    const ptyPool = new FakePtyPool()
    const chatAdapter = new ChatAdapter()
    const sendToRenderer = vi.fn()
    const onDevServerNeeded = vi.fn()

    const wirer = new SessionStreamWirer(
      ptyPool as never,
      () => chatAdapter,
      sendToRenderer,
      undefined,
      vi.fn(),
      onDevServerNeeded,
    )

    const session = createSession()
    wirer.wireStreamJsonOutput(session.ptyId, session, 'codex-jsonl')
    wirer.wirePrintModeInitialExitHandling(session.ptyId, session)

    ptyPool.emitData(
      session.ptyId,
      `${JSON.stringify({
        type: 'item.completed',
        item: {
          type: 'agent_message',
          text: 'Vite failed with 127.0.0.1:5173, so preview did not start.',
        },
      })}\n${JSON.stringify({ type: 'turn.completed' })}\n`,
    )
    ptyPool.emitExit(session.ptyId, 0)

    expect(session.detectedUrl).toBeUndefined()
    expect(onDevServerNeeded).toHaveBeenCalledWith(session)
    expect(sendToRenderer).not.toHaveBeenCalledWith('preview:url-detected', expect.anything())
    expect(chatAdapter.getMessages(session.id)).toEqual([
      expect.objectContaining({
        role: 'agent',
        text: 'Vite failed with 127.0.0.1:5173, so preview did not start.',
      }),
    ])
  })

  it('still promotes preview URLs from actual plain-text process output', () => {
    const ptyPool = new FakePtyPool()
    const sendToRenderer = vi.fn()

    const wirer = new SessionStreamWirer(
      ptyPool as never,
      () => null,
      sendToRenderer,
      undefined,
      vi.fn(),
      vi.fn(),
    )

    const session = createSession()
    session.runtimeId = 'gemini'
    wirer.wireOutputStreaming(session.ptyId, session)

    ptyPool.emitData(session.ptyId, 'Local: http://127.0.0.1:5174/\n')

    expect(session.detectedUrl).toBe('http://127.0.0.1:5174/')
    expect(sendToRenderer).toHaveBeenCalledWith('preview:url-detected', {
      sessionId: session.id,
      url: 'http://127.0.0.1:5174/',
    })
  })
})
