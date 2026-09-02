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

  it('places a workspace working set before the prompt', () => {
    // Codex reads the prompt positionally and Claude's -p consumes the next
    // argument, so a dir appended after the prompt would be swallowed by it.
    expect(buildSimpleRuntimeCommand('codex', 'build it', ['/repo/b', '/repo/c']).args).toEqual([
      'exec', '--dangerously-bypass-approvals-and-sandbox', '--json',
      '--add-dir', '/repo/b', '--add-dir', '/repo/c',
      'build it',
    ])
    expect(buildSimpleRuntimeCommand('claude', 'build it', ['/repo/b']).args).toEqual([
      '--allow-dangerously-skip-permissions',
      '--permission-mode', 'bypassPermissions',
      '--add-dir', '/repo/b',
      '-p', 'build it',
      '--output-format', 'stream-json',
      '--verbose',
    ])
  })

  it('throws for unknown runtimes', () => {
    expect(() => buildSimpleRuntimeCommand('unknown', 'build it')).toThrow('Runtime not found: unknown')
  })
})

describe('buildSimpleRuntimeCommand for orchestrated workers', () => {
  it('denies the catastrophic command set for a guarded Claude worker via inline settings', () => {
    const { args } = buildSimpleRuntimeCommand('claude', 'build it', [], { guarded: true })
    const settingsIndex = args.indexOf('--settings')
    expect(settingsIndex).toBeGreaterThan(-1)
    expect(settingsIndex).toBeLessThan(args.indexOf('-p'))
    const settings = JSON.parse(args[settingsIndex + 1]) as { permissions: { deny: string[] } }
    expect(settings.permissions.deny).toEqual(expect.arrayContaining([
      'Bash(git push*--force*)',
      'Bash(git push* -f*)',
      'Bash(rm -rf /*)',
      'Bash(gh pr merge*)',
    ]))
  })

  it('leaves unguarded Claude and guarded non-Claude commands untouched', () => {
    expect(buildSimpleRuntimeCommand('claude', 'build it').args).not.toContain('--settings')
    expect(buildSimpleRuntimeCommand('codex', 'build it', [], { guarded: true }).args).not.toContain('--settings')
  })
})
