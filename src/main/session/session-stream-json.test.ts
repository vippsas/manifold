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

  it('maps Codex token_count totals to per-run usage with user-message turns', () => {
    const onRunUsage = vi.fn()
    const s = session()
    handleStreamJsonEvent(ctx({ onRunUsage }), s,
      { type: 'event_msg', payload: { type: 'user_message', message: 'hi' } }, 'p1', 'codex-jsonl')
    handleStreamJsonEvent(ctx({ onRunUsage }), s,
      { type: 'event_msg', payload: { type: 'token_count', info: {
        total_token_usage: { input_tokens: 100, cached_input_tokens: 25, output_tokens: 9 },
      } } },
      'p1',
      'codex-jsonl',
    )

    expect(onRunUsage).toHaveBeenCalledWith(expect.anything(), 'p1', {
      inputTokens: 100, outputTokens: 9, cacheReadTokens: 25, cacheCreationTokens: 0,
    }, 1)
  })

  it('migrates Codex live turn counts from PTY id to thread id when the thread starts', () => {
    const onRunUsage = vi.fn()
    const onRuntimeMeta = vi.fn()
    const s = session()
    handleStreamJsonEvent(ctx({ onRunUsage, onRuntimeMeta }), s,
      { type: 'event_msg', payload: { type: 'user_message', message: 'hi' } }, 'p1', 'codex-jsonl')
    handleStreamJsonEvent(ctx({ onRunUsage, onRuntimeMeta }), s,
      { type: 'thread.started', thread_id: 'thread-1' }, 'p1', 'codex-jsonl')
    handleStreamJsonEvent(ctx({ onRunUsage, onRuntimeMeta }), s,
      { type: 'event_msg', payload: { type: 'token_count', info: {
        total_token_usage: { input_tokens: 200, cached_input_tokens: 50, output_tokens: 20 },
      } } },
      'p1',
      'codex-jsonl',
    )

    expect(s.codexThreadId).toBe('thread-1')
    expect(onRuntimeMeta).toHaveBeenCalledWith(s)
    expect(onRunUsage).toHaveBeenCalledWith(expect.anything(), 'thread-1', {
      inputTokens: 200, outputTokens: 20, cacheReadTokens: 50, cacheCreationTokens: 0,
    }, 1)
  })
})
