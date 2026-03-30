import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { getRuntimeById } from '../agent/runtimes'
import type { GitOperationsManager } from '../git/git-operations'
import type { PtyPool } from '../agent/pty-pool'
import type { InternalSession } from './session-types'

const HISTORY_LINES = 20
const SUGGESTION_TIMEOUT_MS = 30_000

/**
 * Parse a single zsh history line, stripping extended history format.
 * Extended format: `: <timestamp>:<duration>;<command>`
 * Returns null for empty lines.
 */
export function parseZshHistoryLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const match = trimmed.match(/^: \d+:\d+;(.+)/)
  return match ? match[1] : trimmed
}

/**
 * Read the last N commands from a zsh history file.
 * Returns most recent commands last.
 */
export function readRecentHistory(historyPath: string, count: number): string[] {
  if (!fs.existsSync(historyPath)) return []
  try {
    const content = fs.readFileSync(historyPath, 'utf-8')
    const lines = content.split('\n')
    const commands: string[] = []
    for (let i = lines.length - 1; i >= 0 && commands.length < count; i--) {
      const parsed = parseZshHistoryLine(lines[i])
      if (parsed) commands.push(parsed)
    }
    return commands.reverse()
  } catch {
    return []
  }
}

/**
 * Build the AI prompt for command prediction.
 */
export function buildSuggestionPrompt(
  history: string[],
  gitStatus: string,
  cwdBasename: string,
  terminalOutput?: string,
): string {
  const historyBlock = history.length > 0
    ? history.join('\n')
    : '(no recent commands)'

  const outputBlock = terminalOutput
    ? `\nRecent terminal output:\n${terminalOutput}\n`
    : ''

  return `You are a shell command predictor. Based on the shell history, git status, and recent terminal output below, predict the single most likely next command the user will run. Reply with ONLY the command, nothing else. No explanation, no markdown, no quotes. If there is nothing useful to do, reply with an empty line.

Shell history (most recent last):
${historyBlock}

Git status:
${gitStatus}
${outputBlock}
Working directory: ${cwdBasename}

Predicted command:`
}

/**
 * Gather git status for the given cwd.
 */
export function gatherGitStatus(cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile('git', ['status', '--porcelain', '--branch'], { cwd, timeout: 3000 }, (err, stdout) => {
      if (err) {
        resolve('(git status unavailable)')
        return
      }
      resolve(stdout.trim())
    })
  })
}

/**
 * Resolve the HISTFILE path from the session's zdotdir .zshrc.
 */
function resolveHistoryPath(session: InternalSession): string | null {
  if (!session.zdotdir) return null
  try {
    const rc = fs.readFileSync(path.join(session.zdotdir, '.zshrc'), 'utf-8')
    const match = rc.match(/HISTFILE="([^"]+)"/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/**
 * Inject ghost text (dimmed suggestion) after the cursor position.
 */
export function injectGhostText(ptyPool: PtyPool, ptyId: string, text: string): void {
  const ghost = `\x1b7\x1b[2m${text}\x1b8`
  ptyPool.pushOutput(ptyId, ghost)
}

/**
 * Clear ghost text by restoring saved cursor position and erasing to end of line.
 */
export function clearGhostText(ptyPool: PtyPool, ptyId: string): void {
  const clear = `\x1b8\x1b[K`
  ptyPool.pushOutput(ptyId, clear)
}

function hasBufferedPromptInput(session: InternalSession): boolean {
  return session.nlInputBuffer?.hasBufferedInput() ?? false
}

/**
 * Trigger an AI prediction for the next shell command.
 * Fire-and-forget — errors are silently ignored.
 */
export async function predictNextCommand(
  session: InternalSession,
  ptyPool: PtyPool,
  gitOps: GitOperationsManager,
): Promise<void> {
  if (session.runtimeId !== '__shell__') return
  if (!session.ptyId) return
  if (hasBufferedPromptInput(session)) return

  if (!session.shellSuggestion) {
    session.shellSuggestion = { activeSuggestion: null, pending: false }
  }

  const suggestionState = session.shellSuggestion
  suggestionState.pending = true
  suggestionState.activeSuggestion = null

  try {
    const historyPath = resolveHistoryPath(session)
    const [history, gitStatus] = await Promise.all([
      Promise.resolve(historyPath ? readRecentHistory(historyPath, HISTORY_LINES) : []),
      gatherGitStatus(session.worktreePath),
    ])

    if (!suggestionState.pending || hasBufferedPromptInput(session)) {
      suggestionState.pending = false
      return
    }

    const runtime = getRuntimeById('claude')
    if (!runtime) {
      suggestionState.pending = false
      return
    }

    const terminalOutput = session.nlOutputBuffer?.getText() || ''

    const prompt = buildSuggestionPrompt(
      history,
      gitStatus,
      path.basename(session.worktreePath),
      terminalOutput,
    )

    const result = await gitOps.aiGenerate(
      runtime,
      prompt,
      session.worktreePath,
      runtime.aiModelArgs ?? [],
      { timeoutMs: SUGGESTION_TIMEOUT_MS, silent: true },
    )

    if (!suggestionState.pending || hasBufferedPromptInput(session)) {
      suggestionState.pending = false
      return
    }

    const suggestion = result.trim()
    if (!suggestion || suggestion.includes('\n')) {
      suggestionState.pending = false
      return
    }

    suggestionState.activeSuggestion = suggestion
    suggestionState.pending = false
    injectGhostText(ptyPool, session.ptyId, suggestion)
  } catch {
    suggestionState.pending = false
  }
}

/**
 * Accept the current suggestion — write the command to PTY stdin.
 */
export function acceptSuggestion(
  session: InternalSession,
  ptyPool: PtyPool,
): boolean {
  const suggestion = session.shellSuggestion?.activeSuggestion
  if (!suggestion || !session.ptyId) return false

  clearGhostText(ptyPool, session.ptyId)
  ptyPool.write(session.ptyId, suggestion)
  session.shellSuggestion!.pending = false
  session.shellSuggestion!.activeSuggestion = null
  return true
}

/**
 * Dismiss the current suggestion — clear ghost text.
 */
export function dismissSuggestion(
  session: InternalSession,
  ptyPool: PtyPool,
): void {
  if (!session.shellSuggestion) return

  session.shellSuggestion.pending = false

  if (session.shellSuggestion.activeSuggestion && session.ptyId) {
    clearGhostText(ptyPool, session.ptyId)
  }
  session.shellSuggestion.activeSuggestion = null
}
