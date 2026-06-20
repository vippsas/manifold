import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { encodeClaudeProjectDir, readClaudeTranscriptUsage } from './transcript-usage-reader'

function line(obj: unknown): string { return JSON.stringify(obj) }

function assistant(id: string, u: { input?: number; output?: number; cr?: number; cc?: number }): string {
  return line({ type: 'assistant', message: { id, usage: {
    input_tokens: u.input ?? 0, output_tokens: u.output ?? 0,
    cache_read_input_tokens: u.cr ?? 0, cache_creation_input_tokens: u.cc ?? 0,
  } } })
}
const humanTurn = (text: string): string => line({ type: 'user', message: { role: 'user', content: text } })
const toolResult = (): string => line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'x' }] } })

describe('encodeClaudeProjectDir', () => {
  it('replaces slashes and dots with dashes', () => {
    expect(encodeClaudeProjectDir('/Users/sv/.manifold/wt/foo-3'))
      .toBe('-Users-sv--manifold-wt-foo-3')
  })
})

describe('readClaudeTranscriptUsage', () => {
  let dir: string
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tx-')) })
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

  async function writeTranscript(worktreePath: string, sessionId: string, lines: string[]): Promise<void> {
    const projDir = path.join(dir, encodeClaudeProjectDir(worktreePath))
    await fs.mkdir(projDir, { recursive: true })
    await fs.writeFile(path.join(projDir, `${sessionId}.jsonl`), lines.join('\n') + '\n')
  }

  it('sums usage deduped by message.id and counts human turns', async () => {
    const wt = '/Users/sv/wt/foo'
    await writeTranscript(wt, 'sid-1', [
      humanTurn('hello'),
      assistant('a1', { input: 100, output: 10, cr: 5, cc: 2 }),
      assistant('a1', { input: 100, output: 10, cr: 5, cc: 2 }), // duplicate id — must not double count
      toolResult(),
      assistant('a2', { input: 50, output: 20, cr: 0, cc: 0 }),
      humanTurn('again'),
      assistant('a3', { input: 7, output: 3, cr: 1, cc: 1 }),
    ])
    const r = await readClaudeTranscriptUsage({ claudeProjectsDir: dir, worktreePath: wt, sessionId: 'sid-1' })
    expect(r).toEqual({
      tokenUsage: { inputTokens: 157, outputTokens: 33, cacheReadTokens: 6, cacheCreationTokens: 3 },
      turns: 2,
    })
  })

  it('skips malformed lines, returns zeros-with-turns for a prompt-only file', async () => {
    const wt = '/Users/sv/wt/bar'
    await writeTranscript(wt, 'sid-2', ['not json', humanTurn('hi')])
    const r = await readClaudeTranscriptUsage({ claudeProjectsDir: dir, worktreePath: wt, sessionId: 'sid-2' })
    expect(r).toEqual({ tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }, turns: 1 })
  })

  it('returns null when no transcript exists for the session id', async () => {
    const r = await readClaudeTranscriptUsage({ claudeProjectsDir: dir, worktreePath: '/Users/sv/wt/none', sessionId: 'missing' })
    expect(r).toBeNull()
  })

  it('falls back to scanning project dirs when the encoded dir does not match', async () => {
    const wt = '/Users/sv/wt/scan'
    const projDir = path.join(dir, 'some-other-encoding')
    await fs.mkdir(projDir, { recursive: true })
    await fs.writeFile(path.join(projDir, 'sid-3.jsonl'), assistant('a1', { input: 5, output: 1 }) + '\n')
    const r = await readClaudeTranscriptUsage({ claudeProjectsDir: dir, worktreePath: wt, sessionId: 'sid-3' })
    expect(r?.tokenUsage.inputTokens).toBe(5)
  })
})
