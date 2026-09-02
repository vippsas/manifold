import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { encodeClaudeProjectDir, readClaudeTranscriptUsage, readClaudeTranscriptUsageSync, locateClaudeTranscript } from './transcript-usage-reader'

function line(obj: unknown): string { return JSON.stringify(obj) }

function assistant(id: string, u: { input?: number; output?: number; cr?: number; cc?: number }): string {
  return line({ type: 'assistant', message: { id, usage: {
    input_tokens: u.input ?? 0, output_tokens: u.output ?? 0,
    cache_read_input_tokens: u.cr ?? 0, cache_creation_input_tokens: u.cc ?? 0,
  } } })
}
const humanTurn = (text: string): string => line({ type: 'user', message: { role: 'user', content: text } })
const toolResult = (): string => line({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'x' }] } })

/** An assistant entry carrying the model, speed, and 5m/1h cache-write split a real transcript records. */
function pricedAssistant(
  id: string,
  model: string,
  speed: string,
  u: { input?: number; output?: number; cr?: number; w5m?: number; w1h?: number },
): string {
  const w5m = u.w5m ?? 0
  const w1h = u.w1h ?? 0
  return line({ type: 'assistant', message: { id, model, usage: {
    input_tokens: u.input ?? 0, output_tokens: u.output ?? 0,
    cache_read_input_tokens: u.cr ?? 0, cache_creation_input_tokens: w5m + w1h,
    cache_creation: { ephemeral_5m_input_tokens: w5m, ephemeral_1h_input_tokens: w1h },
    speed,
  } } })
}

const NO_TOKENS = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 }

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
      byRate: { unknown: { ...NO_TOKENS, inputTokens: 157, outputTokens: 33, cacheReadTokens: 6, cacheWrite5mTokens: 3 } },
      contextTokens: 9, // the last call only: 7 in + 1 cache read + 1 cache write
    })
  })

  it('skips malformed lines, returns zeros-with-turns for a prompt-only file', async () => {
    const wt = '/Users/sv/wt/bar'
    await writeTranscript(wt, 'sid-2', ['not json', humanTurn('hi')])
    const r = await readClaudeTranscriptUsage({ claudeProjectsDir: dir, worktreePath: wt, sessionId: 'sid-2' })
    expect(r).toEqual({ tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }, turns: 1, byRate: {}, contextTokens: 0 })
  })

  it('buckets usage by model and speed, splitting 5m from 1h cache writes', async () => {
    const wt = '/Users/sv/wt/split'
    await writeTranscript(wt, 'sid-split', [
      humanTurn('hi'),
      pricedAssistant('a1', 'claude-opus-5', 'standard', { input: 10, output: 5, cr: 3, w1h: 100 }),
      pricedAssistant('a1', 'claude-opus-5', 'standard', { input: 10, output: 5, cr: 3, w1h: 100 }), // duplicate id
      pricedAssistant('a2', 'claude-opus-5', 'standard', { input: 1, output: 2, w5m: 7 }),
      pricedAssistant('a3', 'claude-haiku-4-5-20251001', 'standard', { input: 4, output: 2 }),
      pricedAssistant('a4', 'claude-opus-5', 'fast', { input: 6, output: 8 }),
    ])
    const r = await readClaudeTranscriptUsage({ claudeProjectsDir: dir, worktreePath: wt, sessionId: 'sid-split' })
    expect(r?.byRate).toEqual({
      'claude-opus-5': { ...NO_TOKENS, inputTokens: 11, outputTokens: 7, cacheReadTokens: 3, cacheWrite5mTokens: 7, cacheWrite1hTokens: 100 },
      'claude-haiku-4-5-20251001': { ...NO_TOKENS, inputTokens: 4, outputTokens: 2 },
      'claude-opus-5#fast': { ...NO_TOKENS, inputTokens: 6, outputTokens: 8 },
    })
    // The flat totals stay the sum of every bucket.
    expect(r?.tokenUsage).toEqual({ inputTokens: 21, outputTokens: 17, cacheReadTokens: 3, cacheCreationTokens: 107 })
  })

  it('treats cache writes as 5-minute when a transcript omits the duration split', async () => {
    const wt = '/Users/sv/wt/nosplit'
    await writeTranscript(wt, 'sid-nosplit', [assistant('a1', { input: 1, cc: 40 })])
    const r = await readClaudeTranscriptUsage({ claudeProjectsDir: dir, worktreePath: wt, sessionId: 'sid-nosplit' })
    expect(r?.byRate['']).toBeUndefined()
    expect(r?.byRate['unknown']).toEqual({ ...NO_TOKENS, inputTokens: 1, cacheWrite5mTokens: 40 })
  })

  it('reports the current context size, not the cumulative cache traffic', async () => {
    // The last call's input + cache read + cache write is the live context — the
    // figure Claude Code's status line calls `Ctx`. Earlier calls re-read the
    // same prefix and bill for it again, so the running totals far exceed it.
    const wt = '/Users/sv/wt/ctx'
    await writeTranscript(wt, 'sid-ctx', [
      humanTurn('hei'),
      pricedAssistant('a1', 'claude-haiku-4-5', 'standard', { input: 10, output: 5, cr: 30_000, w1h: 75 }),
      humanTurn('hei igjen'),
      pricedAssistant('a2', 'claude-sonnet-5', 'standard', { input: 2, output: 16, cr: 22_823, w1h: 19_630 }),
    ])
    const r = await readClaudeTranscriptUsage({ claudeProjectsDir: dir, worktreePath: wt, sessionId: 'sid-ctx' })
    expect(r?.contextTokens).toBe(42_455)
    // Cumulative cache traffic is much larger — that is the point of showing both.
    expect(r?.tokenUsage.cacheReadTokens).toBe(52_823)
  })

  it('has no context to report before the first assistant reply', async () => {
    const wt = '/Users/sv/wt/noctx'
    await writeTranscript(wt, 'sid-noctx', [humanTurn('hei')])
    const r = await readClaudeTranscriptUsage({ claudeProjectsDir: dir, worktreePath: wt, sessionId: 'sid-noctx' })
    expect(r?.contextTokens).toBe(0)
  })

  it('does not count a local slash command as a human turn', async () => {
    // `/model` is handled locally: the transcript records the command envelope
    // and its stdout as user entries, but neither is a prompt to the model.
    const wt = '/Users/sv/wt/slash'
    await writeTranscript(wt, 'sid-slash', [
      humanTurn('hei'),
      humanTurn('<command-name>/model</command-name>\n<command-message>model</command-message>'),
      humanTurn('<local-command-stdout>Set model to `Sonnet 5`</local-command-stdout>'),
      humanTurn('hei igjen'),
    ])
    const r = await readClaudeTranscriptUsage({ claudeProjectsDir: dir, worktreePath: wt, sessionId: 'sid-slash' })
    expect(r?.turns).toBe(2)
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

  it('readClaudeTranscriptUsageSync returns the same usage synchronously', async () => {
    const wt = '/Users/sv/wt/sync'
    await writeTranscript(wt, 'sid-sync', [humanTurn('hi'), assistant('a1', { input: 42, output: 8 })])
    const r = readClaudeTranscriptUsageSync({ claudeProjectsDir: dir, worktreePath: wt, sessionId: 'sid-sync' })
    expect(r).toEqual({
      tokenUsage: { inputTokens: 42, outputTokens: 8, cacheReadTokens: 0, cacheCreationTokens: 0 },
      turns: 1,
      byRate: { unknown: { ...NO_TOKENS, inputTokens: 42, outputTokens: 8 } },
      contextTokens: 42,
    })
  })

  it('readClaudeTranscriptUsageSync returns null when no transcript exists', () => {
    const r = readClaudeTranscriptUsageSync({ claudeProjectsDir: dir, worktreePath: '/none', sessionId: 'missing' })
    expect(r).toBeNull()
  })

  it('locateClaudeTranscript returns the transcript path when present', async () => {
    const wt = '/Users/sv/wt/loc'
    await writeTranscript(wt, 'sid-loc', [humanTurn('hi')])
    const found = await locateClaudeTranscript({ claudeProjectsDir: dir, worktreePath: wt, sessionId: 'sid-loc' })
    expect(found).toBe(path.join(dir, encodeClaudeProjectDir(wt), 'sid-loc.jsonl'))
  })
})
