import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { parseCodexRolloutUsage, readCodexUsage, readCodexUsageSync } from './codex-usage-reader'

function line(obj: unknown): string { return JSON.stringify(obj) }

function tokenCount(input: number, output: number, cached = 0): string {
  return line({
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: input,
          cached_input_tokens: cached,
          output_tokens: output,
          total_tokens: input + output,
        },
      },
    },
  })
}

const userMessage = (): string => line({ type: 'event_msg', payload: { type: 'user_message', message: 'hi' } })
const agentMessage = (): string => line({ type: 'event_msg', payload: { type: 'agent_message', message: 'done' } })

describe('parseCodexRolloutUsage', () => {
  it('uses the latest cumulative total and counts user messages as turns', () => {
    const usage = parseCodexRolloutUsage([
      userMessage(),
      tokenCount(100, 10, 4),
      'not json',
      agentMessage(),
      userMessage(),
      tokenCount(180, 25, 20),
    ].join('\n'))

    expect(usage).toEqual({
      tokenUsage: { inputTokens: 180, outputTokens: 25, cacheReadTokens: 20, cacheCreationTokens: 0 },
      turns: 2,
    })
  })

  it('returns null when a rollout has no token_count event', () => {
    expect(parseCodexRolloutUsage([userMessage(), agentMessage()].join('\n'))).toBeNull()
  })
})

describe('readCodexUsage', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-usage-'))
    await fs.mkdir(path.join(dir, 'sessions'), { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  async function writeRollout(name: string, lines: string[]): Promise<string> {
    const file = path.join(dir, 'sessions', `${name}.jsonl`)
    await fs.writeFile(file, lines.join('\n') + '\n')
    return file
  }

  function writeState(rows: Array<{
    id: string
    rolloutPath: string
    cwd: string
    source: string
    createdAtMs: number
    updatedAtMs: number
  }>): void {
    const db = new Database(path.join(dir, 'state_5.sqlite'))
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        rollout_path TEXT NOT NULL,
        cwd TEXT NOT NULL,
        source TEXT NOT NULL,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0,
        created_at_ms INTEGER,
        updated_at_ms INTEGER
      )
    `)
    const stmt = db.prepare(`
      INSERT INTO threads (id, rollout_path, cwd, source, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    for (const row of rows) {
      stmt.run(row.id, row.rolloutPath, row.cwd, row.source, row.createdAtMs, row.updatedAtMs)
    }
    db.close()
  }

  it('sums every rollout matching the worktree and session time window', async () => {
    const first = await writeRollout('first', [userMessage(), tokenCount(100, 10, 5)])
    const second = await writeRollout('second', [userMessage(), tokenCount(20, 2, 1)])
    const outside = await writeRollout('outside', [userMessage(), tokenCount(999, 999, 999)])
    const otherCwd = await writeRollout('other', [userMessage(), tokenCount(888, 888, 888)])

    writeState([
      { id: 'first', rolloutPath: first, cwd: '/wt', source: 'cli', createdAtMs: 1_000, updatedAtMs: 2_000 },
      { id: 'second', rolloutPath: second, cwd: '/wt', source: 'exec', createdAtMs: 3_000, updatedAtMs: 4_000 },
      { id: 'outside', rolloutPath: outside, cwd: '/wt', source: 'cli', createdAtMs: 6_000, updatedAtMs: 7_000 },
      { id: 'other', rolloutPath: otherCwd, cwd: '/other', source: 'cli', createdAtMs: 2_000, updatedAtMs: 3_000 },
    ])

    const usage = await readCodexUsage({
      codexHomeDir: dir,
      worktreePath: '/wt',
      sessionId: 'manifold-session',
      createdAtMs: 500,
      terminatedAtMs: 5_000,
    })

    expect(usage).toEqual({
      tokenUsage: { inputTokens: 120, outputTokens: 12, cacheReadTokens: 6, cacheCreationTokens: 0 },
      turns: 2,
    })
  })

  it('uses a known Codex thread id even when it is outside the time window', async () => {
    const file = await writeRollout('known', [userMessage(), tokenCount(42, 7, 3)])
    writeState([
      { id: 'known-thread', rolloutPath: file, cwd: '/other', source: 'exec', createdAtMs: 10_000, updatedAtMs: 11_000 },
    ])

    const usage = readCodexUsageSync({
      codexHomeDir: dir,
      worktreePath: '/wt',
      sessionId: 'manifold-session',
      codexThreadId: 'known-thread',
      createdAtMs: 500,
      terminatedAtMs: 5_000,
    })

    expect(usage).toEqual({
      tokenUsage: { inputTokens: 42, outputTokens: 7, cacheReadTokens: 3, cacheCreationTokens: 0 },
      turns: 1,
    })
  })

  it('returns null when the Codex state database is missing', () => {
    fsSync.rmSync(path.join(dir, 'state_5.sqlite'), { force: true })
    expect(readCodexUsageSync({
      codexHomeDir: dir,
      worktreePath: '/wt',
      sessionId: 'manifold-session',
      createdAtMs: 1,
      terminatedAtMs: 2,
    })).toBeNull()
  })
})
