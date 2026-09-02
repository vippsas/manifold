import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { TokenUsage } from '../../shared/verdict-types'
import { rateKey, type CostTokens } from './model-pricing'

interface TranscriptLocator {
  claudeProjectsDir: string
  worktreePath: string
  sessionId: string
}

export interface SessionUsage {
  tokenUsage: TokenUsage
  turns: number
}

/**
 * Claude usage, additionally bucketed for pricing. `tokenUsage` stays the flat
 * total every existing caller reads; `byRate` splits the same tokens by model,
 * speed, and cache-write duration, which is what `estimateCostUsd` needs.
 */
export interface ClaudeSessionUsage extends SessionUsage {
  byRate: Record<string, CostTokens>
  /**
   * The live context size: what the most recent request actually carried.
   *
   * Distinct from the cumulative figures above, and much smaller. Every turn
   * re-reads the cached prefix and is billed for it again, so `cacheReadTokens`
   * grows without bound while the context stays roughly flat. This is the number
   * Claude Code's status line shows as `Ctx`.
   */
  contextTokens: number
}

/** The subset of a transcript's `message.usage` that pricing reads. */
interface RawUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number }
  speed?: string
}

/** Default Claude transcript root: ~/.claude/projects. */
export function claudeProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects')
}

/** Claude encodes a project's cwd into a dir name by replacing every non-alphanumeric char with '-'. */
export function encodeClaudeProjectDir(absPath: string): string {
  return absPath.replace(/[^a-zA-Z0-9]/g, '-')
}

/** Read per-session token usage + turn count from Claude's on-disk JSONL transcript. */
export async function readClaudeTranscriptUsage(opts: TranscriptLocator): Promise<ClaudeSessionUsage | null> {
  const file = await locateClaudeTranscript(opts)
  if (!file) return null
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch {
    return null
  }
  return parseTranscriptUsage(raw)
}

/**
 * Synchronous variant for the app-quit teardown path, where async work after the
 * first await is not guaranteed to run before the process exits.
 */
export function readClaudeTranscriptUsageSync(opts: TranscriptLocator): ClaudeSessionUsage | null {
  const file = locateClaudeTranscriptSync(opts)
  if (!file) return null
  try {
    return parseTranscriptUsage(fsSync.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** Resolve the on-disk transcript path for a session id, or null if none exists. */
export async function locateClaudeTranscript(opts: TranscriptLocator): Promise<string | null> {
  const fileName = `${opts.sessionId}.jsonl`
  const direct = path.join(opts.claudeProjectsDir, encodeClaudeProjectDir(opts.worktreePath), fileName)
  if (await exists(direct)) return direct
  // Fallback: encoding can vary, but the session id is unique — scan project dirs.
  let entries: string[]
  try {
    entries = await fs.readdir(opts.claudeProjectsDir)
  } catch {
    return null
  }
  for (const entry of entries) {
    const candidate = path.join(opts.claudeProjectsDir, entry, fileName)
    if (await exists(candidate)) return candidate
  }
  return null
}

function locateClaudeTranscriptSync(opts: TranscriptLocator): string | null {
  const fileName = `${opts.sessionId}.jsonl`
  const direct = path.join(opts.claudeProjectsDir, encodeClaudeProjectDir(opts.worktreePath), fileName)
  if (fsSync.existsSync(direct)) return direct
  let entries: string[]
  try {
    entries = fsSync.readdirSync(opts.claudeProjectsDir)
  } catch {
    return null
  }
  for (const entry of entries) {
    const candidate = path.join(opts.claudeProjectsDir, entry, fileName)
    if (fsSync.existsSync(candidate)) return candidate
  }
  return null
}

function parseTranscriptUsage(raw: string): ClaudeSessionUsage {
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
  const byRate: Record<string, CostTokens> = {}
  const seen = new Set<string>()
  let turns = 0
  let contextTokens = 0
  for (const lineText of raw.split('\n')) {
    const trimmed = lineText.trim()
    if (!trimmed) continue
    let e: Record<string, unknown>
    try { e = JSON.parse(trimmed) } catch { continue }
    if (e.type === 'assistant') {
      const message = e.message as { id?: string; model?: string; usage?: RawUsage } | undefined
      // The newest main-thread request wins: a later call supersedes an earlier
      // one's context. Sidechains are subagents with their own window, not this
      // conversation's.
      if (e.isSidechain !== true && message?.usage) {
        const u = message.usage
        contextTokens = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
      }
      const id = message?.id
      // Transcripts duplicate assistant entries by message.id — count usage once per id.
      if (id && seen.has(id)) continue
      if (id) seen.add(id)
      const u = message?.usage
      if (u) {
        const write1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0
        // Transcripts written before the duration split existed report one total;
        // bill those as 5-minute writes, the cheaper and historically default TTL.
        const write5m = u.cache_creation
          ? u.cache_creation.ephemeral_5m_input_tokens ?? 0
          : u.cache_creation_input_tokens ?? 0

        usage.inputTokens += u.input_tokens ?? 0
        usage.outputTokens += u.output_tokens ?? 0
        usage.cacheReadTokens += u.cache_read_input_tokens ?? 0
        usage.cacheCreationTokens += u.cache_creation_input_tokens ?? 0

        // An entry with no model still cost something — bucket it so the estimate
        // reports itself as incomplete rather than silently dropping the tokens.
        const bucket = bucketFor(byRate, rateKey(message?.model ?? 'unknown', u.speed))
        bucket.inputTokens += u.input_tokens ?? 0
        bucket.outputTokens += u.output_tokens ?? 0
        bucket.cacheReadTokens += u.cache_read_input_tokens ?? 0
        bucket.cacheWrite5mTokens += write5m
        bucket.cacheWrite1hTokens += write1h
      }
    } else if (e.type === 'user' && isHumanTurn(e)) {
      turns += 1
    }
  }
  return { tokenUsage: usage, turns, byRate, contextTokens }
}

function bucketFor(byRate: Record<string, CostTokens>, key: string): CostTokens {
  const existing = byRate[key]
  if (existing) return existing
  const fresh: CostTokens = {
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
    cacheWrite5mTokens: 0, cacheWrite1hTokens: 0,
  }
  byRate[key] = fresh
  return fresh
}

/** A human turn: a user entry whose message.content is a string, excluding meta/sidechain rows. */
function isHumanTurn(e: Record<string, unknown>): boolean {
  if (e.isMeta === true || e.isSidechain === true) return false
  const message = e.message as { content?: unknown } | undefined
  if (typeof message?.content !== 'string') return false
  return !isLocalCommandEnvelope(message.content)
}

/**
 * A slash command handled locally (`/model`, `/clear`) is written to the
 * transcript as user entries — the `<command-name>` envelope and a
 * `<local-command-stdout>` result — but neither is a prompt anyone sent to the
 * model, and counting them inflates the turn count (a `/model` switch read as
 * two extra turns).
 */
function isLocalCommandEnvelope(content: string): boolean {
  return /^\s*<(command-|local-command-)/.test(content)
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}
