import { describe, expect, it } from 'vitest'
import { parseAiRuntimeFailure } from './ai-runtime-command'

describe('parseAiRuntimeFailure', () => {
  it('extracts nested API error messages from codex JSONL failure events', () => {
    const stdout = [
      '{"type":"turn.started"}',
      '{"type":"error","message":"{\\"type\\":\\"error\\",\\"status\\":400,\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"message\\":\\"The model is not supported.\\"}}"}',
      '{"type":"turn.failed","error":{"message":"{\\"type\\":\\"error\\",\\"status\\":400,\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"message\\":\\"The model is not supported.\\"}}"}}',
    ].join('\n')

    expect(parseAiRuntimeFailure('codex-jsonl', stdout, '')).toBe('The model is not supported.')
  })

  it('falls back to plain stderr for plain-text runtimes', () => {
    expect(parseAiRuntimeFailure('plain-text', '', 'permission denied')).toBe('permission denied')
  })
})
