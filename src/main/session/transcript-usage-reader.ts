import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import type { TokenUsage } from '../../shared/verdict-types'

export interface SessionUsage {
  tokenUsage: TokenUsage
  turns: number
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
export async function readClaudeTranscriptUsage(opts: {
  claudeProjectsDir: string
  worktreePath: string
  sessionId: string
}): Promise<SessionUsage | null> {
  const file = await locateTranscript(opts)
  if (!file) return null
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch {
    return null
  }
  return parseTranscriptUsage(raw)
}

async function locateTranscript(opts: {
  claudeProjectsDir: string
  worktreePath: string
  sessionId: string
}): Promise<string | null> {
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

function parseTranscriptUsage(raw: string): SessionUsage {
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }
  const seen = new Set<string>()
  let turns = 0
  for (const lineText of raw.split('\n')) {
    const trimmed = lineText.trim()
    if (!trimmed) continue
    let e: Record<string, unknown>
    try { e = JSON.parse(trimmed) } catch { continue }
    if (e.type === 'assistant') {
      const message = e.message as { id?: string; usage?: Record<string, number> } | undefined
      const id = message?.id
      // Transcripts duplicate assistant entries by message.id — count usage once per id.
      if (id && seen.has(id)) continue
      if (id) seen.add(id)
      const u = message?.usage
      if (u) {
        usage.inputTokens += u.input_tokens ?? 0
        usage.outputTokens += u.output_tokens ?? 0
        usage.cacheReadTokens += u.cache_read_input_tokens ?? 0
        usage.cacheCreationTokens += u.cache_creation_input_tokens ?? 0
      }
    } else if (e.type === 'user' && isHumanTurn(e)) {
      turns += 1
    }
  }
  return { tokenUsage: usage, turns }
}

/** A human turn: a user entry whose message.content is a string, excluding meta/sidechain rows. */
function isHumanTurn(e: Record<string, unknown>): boolean {
  if (e.isMeta === true || e.isSidechain === true) return false
  const message = e.message as { content?: unknown } | undefined
  return typeof message?.content === 'string'
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}
