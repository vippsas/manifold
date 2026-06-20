import { describe, it, expect, vi } from 'vitest'
import { handleStreamJsonEvent, type StreamJsonCtx } from './session-stream-json'
import type { InternalSession } from './session-types'

function ctx(over: Partial<StreamJsonCtx> = {}): StreamJsonCtx {
  return {
    getChatAdapter: () => null,
    sendToRenderer: vi.fn(),
    onDevServerNeeded: vi.fn(),
    ...over,
  }
}
function session(): InternalSession {
  return { id: 's1', ptyId: 'p1', status: 'running' } as unknown as InternalSession
}

describe('chat-mode usage capture', () => {
  it('maps result-event usage to TokenUsage and calls onTurnUsage once', () => {
    const onTurnUsage = vi.fn()
    handleStreamJsonEvent(
      ctx({ onTurnUsage }),
      session(),
      { type: 'result', subtype: 'success', result: 'done', usage: {
        input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 4, cache_creation_input_tokens: 2,
      } },
      'p1',
      'claude-stream-json',
    )
    expect(onTurnUsage).toHaveBeenCalledTimes(1)
    expect(onTurnUsage).toHaveBeenCalledWith(expect.anything(), {
      inputTokens: 100, outputTokens: 10, cacheReadTokens: 4, cacheCreationTokens: 2,
    })
  })

  it('still fires onTurnUsage (turn count) when the result has no usage block', () => {
    const onTurnUsage = vi.fn()
    handleStreamJsonEvent(ctx({ onTurnUsage }), session(),
      { type: 'result', subtype: 'success', result: 'done' }, 'p1', 'claude-stream-json')
    expect(onTurnUsage).toHaveBeenCalledWith(expect.anything(),
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 })
  })
})
