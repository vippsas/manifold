import Database from 'better-sqlite3'
import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { TokenUsage } from '../../shared/verdict-types'
import type { SessionUsage } from './transcript-usage-reader'

export interface CodexUsageLocator {
  codexHomeDir: string
  worktreePath: string
  sessionId: string
  codexThreadId?: string
  createdAtMs: number
  terminatedAtMs: number
}

interface ThreadRow {
  rollout_path?: string | null
}

interface CodexTokenCount {
  input_tokens?: number
  cached_input_tokens?: number
  output_tokens?: number
}

export function codexHomeDir(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
}

export async function readCodexUsage(opts: CodexUsageLocator): Promise<SessionUsage | null> {
  const files = locateCodexRolloutsSync(opts)
  if (files.length === 0) return null

  const usages = await Promise.all(files.map(async (file) => {
    try {
      return parseCodexRolloutUsage(await fs.readFile(file, 'utf8'))
    } catch {
      return null
    }
  }))
  return sumSessionUsages(usages)
}

export function readCodexUsageSync(opts: CodexUsageLocator): SessionUsage | null {
  const files = locateCodexRolloutsSync(opts)
  if (files.length === 0) return null

  const usages = files.map((file) => {
    try {
      return parseCodexRolloutUsage(fsSync.readFileSync(file, 'utf8'))
    } catch {
      return null
    }
  })
  return sumSessionUsages(usages)
}

export function parseCodexRolloutUsage(raw: string): SessionUsage | null {
  let tokenUsage: TokenUsage | null = null
  let turns = 0

  for (const lineText of raw.split('\n')) {
    const trimmed = lineText.trim()
    if (!trimmed) continue

    let event: Record<string, unknown>
    try { event = JSON.parse(trimmed) } catch { continue }
    if (event.type !== 'event_msg') continue

    const payload = event.payload as { type?: string; info?: { total_token_usage?: CodexTokenCount } } | undefined
    if (payload?.type === 'user_message') {
      turns += 1
      continue
    }

    if (payload?.type !== 'token_count') continue
    const total = payload.info?.total_token_usage
    if (!total) continue
    tokenUsage = mapCodexUsage(total)
  }

  return tokenUsage ? { tokenUsage, turns } : null
}

function locateCodexRolloutsSync(opts: CodexUsageLocator): string[] {
  const stateDb = path.join(opts.codexHomeDir, 'state_5.sqlite')
  if (!fsSync.existsSync(stateDb)) return []

  let db: Database.Database | null = null
  try {
    db = new Database(stateDb, { readonly: true, fileMustExist: true })
    const paths = new Set<string>()

    if (opts.codexThreadId) {
      const row = db.prepare('SELECT rollout_path FROM threads WHERE id = ?').get(opts.codexThreadId) as ThreadRow | undefined
      addExistingPath(paths, row?.rollout_path)
      if (paths.size > 0) return [...paths]
    }

    const rows = db.prepare(`
      SELECT rollout_path
      FROM threads
      WHERE cwd = ?
        AND source IN ('cli', 'exec')
        AND rollout_path IS NOT NULL
        AND rollout_path <> ''
        AND COALESCE(created_at_ms, created_at * 1000) <= ?
        AND COALESCE(updated_at_ms, updated_at * 1000) >= ?
      ORDER BY COALESCE(created_at_ms, created_at * 1000), id
    `).all(opts.worktreePath, opts.terminatedAtMs, opts.createdAtMs) as ThreadRow[]

    for (const row of rows) {
      addExistingPath(paths, row.rollout_path)
    }

    return [...paths]
  } catch {
    return []
  } finally {
    try { db?.close() } catch { /* ignore close failures */ }
  }
}

function addExistingPath(paths: Set<string>, filePath: string | null | undefined): void {
  if (!filePath) return
  try {
    if (fsSync.statSync(filePath).isFile()) paths.add(filePath)
  } catch {
    // Stale Codex index row; ignore it.
  }
}

function sumSessionUsages(usages: Array<SessionUsage | null>): SessionUsage | null {
  const total: SessionUsage = {
    tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
    turns: 0,
  }
  let found = false

  for (const usage of usages) {
    if (!usage) continue
    found = true
    total.tokenUsage.inputTokens += usage.tokenUsage.inputTokens
    total.tokenUsage.outputTokens += usage.tokenUsage.outputTokens
    total.tokenUsage.cacheReadTokens += usage.tokenUsage.cacheReadTokens
    total.tokenUsage.cacheCreationTokens += usage.tokenUsage.cacheCreationTokens
    total.turns += usage.turns
  }

  return found ? total : null
}

function mapCodexUsage(total: CodexTokenCount): TokenUsage {
  return {
    inputTokens: total.input_tokens ?? 0,
    outputTokens: total.output_tokens ?? 0,
    cacheReadTokens: total.cached_input_tokens ?? 0,
    cacheCreationTokens: 0,
  }
}
