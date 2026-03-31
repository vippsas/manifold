import { describe, expect, it } from 'vitest'
import { buildAiRuntimeCommand, parseAiRuntimeOutput, parseAiRuntimeFailure } from './ai-runtime-command'

describe('buildAiRuntimeCommand', () => {
  it('builds claude command with text output format', () => {
    const cmd = buildAiRuntimeCommand(
      { id: 'claude', name: 'Claude', binary: 'claude', args: ['--flag'] },
      'hello prompt',
      ['--model', 'haiku'],
    )
    expect(cmd.outputMode).toBe('plain-text')
    expect(cmd.args).toContain('--output-format')
    expect(cmd.args[cmd.args.indexOf('--output-format') + 1]).toBe('text')
    expect(cmd.args).toContain('-p')
    expect(cmd.args).toContain('hello prompt')
    expect(cmd.args).toContain('--model')
    expect(cmd.args).toContain('--flag')
  })

  it('builds codex command with jsonl output format', () => {
    const cmd = buildAiRuntimeCommand(
      { id: 'codex', name: 'Codex', binary: 'codex', args: [] },
      'hello prompt',
      ['--model', 'o4-mini'],
    )
    expect(cmd.outputMode).toBe('codex-jsonl')
    expect(cmd.args).toContain('exec')
    expect(cmd.args).toContain('--full-auto')
    expect(cmd.args).toContain('--json')
    expect(cmd.args).toContain('--model')
    expect(cmd.args).toContain('hello prompt')
  })

  it('places codex global args before exec', () => {
    const cmd = buildAiRuntimeCommand(
      { id: 'codex', name: 'Codex', binary: 'codex', args: [] },
      'hello prompt',
      ['--search', '--model', 'o4-mini'],
    )

    expect(cmd.args).toEqual(['--search', 'exec', '--full-auto', '--json', '--model', 'o4-mini', 'hello prompt'])
  })

  it('keeps codex config overrides after exec while preserving global search flags', () => {
    const cmd = buildAiRuntimeCommand(
      { id: 'codex', name: 'Codex', binary: 'codex', args: [] },
      'hello prompt',
      ['--search', '--model', 'gpt-5-codex', '-c', 'model_reasoning_effort="high"'],
    )

    expect(cmd.args).toEqual([
      '--search',
      'exec',
      '--full-auto',
      '--json',
      '--model',
      'gpt-5-codex',
      '-c',
      'model_reasoning_effort="high"',
      'hello prompt',
    ])
  })

  it('builds default runtime command with plain-text output', () => {
    const cmd = buildAiRuntimeCommand(
      { id: 'gemini', name: 'Gemini', binary: 'gemini', args: [] },
      'hello prompt',
    )
    expect(cmd.outputMode).toBe('plain-text')
    expect(cmd.args).toContain('-p')
    expect(cmd.args).toContain('hello prompt')
    expect(cmd.args).not.toContain('--output-format')
  })
})

describe('parseAiRuntimeOutput', () => {
  it('returns trimmed text for plain-text mode', () => {
    expect(parseAiRuntimeOutput('plain-text', '  hello world  \n')).toBe('hello world')
  })

  it('extracts text from claude stream-json assistant events', () => {
    const stdout = [
      '{"type":"system","subtype":"init","tools":[]}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"git push"}]}}',
      '{"type":"result","subtype":"success","result":"git push"}',
    ].join('\n')
    expect(parseAiRuntimeOutput('claude-stream-json', stdout)).toBe('git push')
  })

  it('extracts text from codex jsonl agent_message events', () => {
    const stdout = '{"type":"item.completed","item":{"type":"agent_message","text":"npm test"}}\n'
    expect(parseAiRuntimeOutput('codex-jsonl', stdout)).toBe('npm test')
  })

  it('returns empty string when no text events found', () => {
    const stdout = '{"type":"system","subtype":"init"}\n'
    expect(parseAiRuntimeOutput('claude-stream-json', stdout)).toBe('')
  })
})

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

  it('does not treat codex progress events as the failure message', () => {
    const stdout = [
      '{"type":"item.completed","item":{"type":"web_search","query":"example"}}',
      '{"type":"item.completed","item":{"type":"command_execution","command":"sed -n 1,20p file.ts"}}',
    ].join('\n')

    expect(parseAiRuntimeFailure('codex-jsonl', stdout, '')).toBeNull()
  })
})
