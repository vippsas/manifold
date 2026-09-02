import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { encodeClaudeProjectDir } from './transcript-usage-reader'
import { readSessionCost } from './session-cost'

function assistantLine(model: string, u: { input?: number; output?: number }): string {
  return JSON.stringify({ type: 'assistant', message: { id: `m-${model}-${u.output ?? 0}`, model, usage: {
    input_tokens: u.input ?? 0, output_tokens: u.output ?? 0,
    cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
    speed: 'standard',
  } } })
}
const humanTurn = (text: string): string => JSON.stringify({ type: 'user', message: { role: 'user', content: text } })

describe('readSessionCost', () => {
  let dir: string
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cost-')) })
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }) })

  async function writeTranscript(worktreePath: string, sessionId: string, lines: string[]): Promise<void> {
    const projDir = path.join(dir, encodeClaudeProjectDir(worktreePath))
    await fs.mkdir(projDir, { recursive: true })
    await fs.writeFile(path.join(projDir, `${sessionId}.jsonl`), lines.join('\n') + '\n')
  }

  it('reports tokens, turns, and an estimated cost for a Claude session', async () => {
    const wt = '/Users/sv/wt/cost'
    await writeTranscript(wt, 'sid-1', [
      humanTurn('do the thing'),
      assistantLine('claude-opus-5', { input: 1_000_000, output: 1_000_000 }),
    ])
    const r = await readSessionCost({ runtimeId: 'claude', worktreePath: wt, sessionId: 'sid-1', claudeProjectsDir: dir })
    expect(r?.turns).toBe(1)
    expect(r?.tokenUsage.outputTokens).toBe(1_000_000)
    expect(r?.costUsd).toBeCloseTo(30, 6) // $5 input + $25 output
    expect(r?.unpricedModels).toEqual([])
  })

  it('declines to price a runtime that is not Claude', async () => {
    const wt = '/Users/sv/wt/codex'
    await writeTranscript(wt, 'sid-2', [humanTurn('hi'), assistantLine('claude-opus-5', { output: 10 })])
    const r = await readSessionCost({ runtimeId: 'codex', worktreePath: wt, sessionId: 'sid-2', claudeProjectsDir: dir })
    expect(r).toBeNull()
  })

  it('returns null when the session has no transcript yet', async () => {
    const r = await readSessionCost({ runtimeId: 'claude', worktreePath: '/Users/sv/wt/none', sessionId: 'missing', claudeProjectsDir: dir })
    expect(r).toBeNull()
  })

  it('still reports tokens when the model has no published price', async () => {
    const wt = '/Users/sv/wt/unknown'
    await writeTranscript(wt, 'sid-3', [humanTurn('hi'), assistantLine('claude-mystery-9', { output: 500 })])
    const r = await readSessionCost({ runtimeId: 'claude', worktreePath: wt, sessionId: 'sid-3', claudeProjectsDir: dir })
    expect(r?.tokenUsage.outputTokens).toBe(500)
    expect(r?.costUsd).toBeNull()
    expect(r?.unpricedModels).toEqual(['claude-mystery-9'])
  })
})
