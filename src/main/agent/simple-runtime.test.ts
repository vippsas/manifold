import { describe, it, expect, vi } from 'vitest'

vi.mock('./runtimes', () => ({
  getRuntimeById: vi.fn((id: string) => {
    if (id === 'claude') return { id, binary: 'claude', args: ['--allow-dangerously-skip-permissions'] }
    if (id === 'codex') return { id, binary: 'codex', args: [] }
    if (id === 'gemini') return { id, binary: 'gemini', args: [] }
    return undefined
  }),
}))

import { buildSimpleRuntimeCommand } from './simple-runtime'

describe('buildSimpleRuntimeCommand', () => {
  it('builds Claude simple-mode commands with stream-json output', () => {
    expect(buildSimpleRuntimeCommand('claude', 'build it')).toEqual({
      binary: 'claude',
      args: [
        '--allow-dangerously-skip-permissions',
        '--permission-mode', 'bypassPermissions',
        '-p', 'build it',
        '--output-format', 'stream-json',
        '--verbose',
      ],
      env: undefined,
      outputMode: 'claude-stream-json',
    })
  })

  it('builds Codex simple-mode commands with bypassed approvals and sandbox', () => {
    expect(buildSimpleRuntimeCommand('codex', 'build it')).toEqual({
      binary: 'codex',
      args: ['exec', '--dangerously-bypass-approvals-and-sandbox', '--json', 'build it'],
      env: undefined,
      outputMode: 'codex-jsonl',
    })
  })

  it('falls back to plain text prompt mode for Gemini', () => {
    expect(buildSimpleRuntimeCommand('gemini', 'build it')).toEqual({
      binary: 'gemini',
      args: ['-p', 'build it'],
      env: undefined,
      outputMode: 'plain-text',
    })
  })

  it('throws for unknown runtimes', () => {
    expect(() => buildSimpleRuntimeCommand('unknown', 'build it')).toThrow('Runtime not found: unknown')
  })
})
