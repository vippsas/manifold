import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join, resolve, normalize, sep } from 'node:path'
import { promisify } from 'node:util'
import type { AheadBehind, FetchResult } from '../../shared/types'
import type { AgentRuntime } from '../../shared/types'
import { buildAiRuntimeCommand, parseAiRuntimeFailure, parseAiRuntimeOutput } from '../agent/ai-runtime-command'
import {
  commitManagedWorktree,
  getManagedWorktreeStatus,
  stageManagedWorktreePath,
} from './managed-worktree'

const execFileAsync = promisify(execFile)

const DEFAULT_AI_GENERATE_TIMEOUT_MS = 30_000

/** Grace period after SIGTERM on timeout before escalating to SIGKILL. */
const AI_GENERATE_KILL_GRACE_MS = 2_000

interface AiGenerateOptions {
  timeoutMs?: number
  /** When true, suppress console.error logging on failure (for fire-and-forget callers like shell suggestions). */
  silent?: boolean
  /** Abort the in-flight model subprocess (kills it SIGTERM→SIGKILL) and reject. */
  signal?: AbortSignal
}

/**
 * Live aiGenerate model children, so quit teardown can kill any that would
 * otherwise orphan. Entries are added on spawn and removed on settle.
 */
const inFlightAiGenerateChildren = new Set<ChildProcess>()

/**
 * Kill every in-flight aiGenerate model subprocess (SIGTERM, then SIGKILL after
 * a grace period). Called from the app `before-quit` handler so orphaned model
 * CLIs are reaped on quit rather than left running to completion.
 */
export function killInFlightAiGenerateChildren(): void {
  for (const child of inFlightAiGenerateChildren) {
    try {
      child.kill('SIGTERM')
      const killTimer = setTimeout(() => child.kill('SIGKILL'), AI_GENERATE_KILL_GRACE_MS)
      killTimer.unref?.()
    } catch {
      // Child may already be gone; ignore.
    }
  }
}

export class GitOperationsManager {
  async commit(worktreePath: string, message: string): Promise<void> {
    await commitManagedWorktree(worktreePath, message)
  }

  async fetchAndUpdate(projectPath: string, baseBranch: string): Promise<FetchResult> {
    const { stdout: prevRaw } = await execFileAsync(
      'git', ['rev-parse', '--short', baseBranch], { cwd: projectPath }
    )
    const previousRef = prevRaw.trim()

    await execFileAsync('git', ['fetch', 'origin'], { cwd: projectPath })

    // Determine if baseBranch is currently checked out in the project.
    // If so, use merge --ff-only (works on checked-out branch).
    // Otherwise, use fetch origin branch:branch (updates ref directly).
    const { stdout: headBranch } = await execFileAsync(
      'git', ['symbolic-ref', '--short', 'HEAD'], { cwd: projectPath }
    ).catch(() => ({ stdout: '' }))

    if (headBranch.trim() === baseBranch) {
      await execFileAsync(
        'git', ['merge', '--ff-only', `origin/${baseBranch}`], { cwd: projectPath }
      )
    } else {
      await execFileAsync(
        'git', ['fetch', 'origin', `${baseBranch}:${baseBranch}`], { cwd: projectPath }
      )
    }

    const { stdout: currRaw } = await execFileAsync(
      'git', ['rev-parse', '--short', baseBranch], { cwd: projectPath }
    )
    const currentRef = currRaw.trim()

    const { stdout: countRaw } = await execFileAsync(
      'git', ['rev-list', '--count', `${previousRef}..${currentRef}`], { cwd: projectPath }
    )
    const commitCount = parseInt(countRaw.trim(), 10) || 0

    return { updatedBranch: baseBranch, previousRef, currentRef, commitCount }
  }

  async getAheadBehind(worktreePath: string, baseBranch: string): Promise<AheadBehind> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['rev-list', '--left-right', '--count', `${baseBranch}...HEAD`],
        { cwd: worktreePath }
      )
      const [behind, ahead] = stdout.trim().split(/\s+/).map(Number)
      return { ahead: ahead ?? 0, behind: behind ?? 0 }
    } catch {
      // Branch may not exist yet or have no common ancestor — safe default
      return { ahead: 0, behind: 0 }
    }
  }

  async isBranchMerged(worktreePath: string, baseBranch: string, branch: string): Promise<boolean> {
    try {
      await execFileAsync(
        'git',
        ['merge-base', '--is-ancestor', branch, baseBranch],
        { cwd: worktreePath },
      )
      return true
    } catch {
      return false
    }
  }

  async getConflicts(worktreePath: string): Promise<string[]> {
    try {
      const stdout = await getManagedWorktreeStatus(worktreePath)
      return parseConflicts(stdout)
    } catch {
      // git status may fail if worktree is not fully initialized
      return []
    }
  }

  async resolveConflict(
    worktreePath: string,
    filePath: string,
    resolvedContent: string
  ): Promise<void> {
    const resolved = resolve(worktreePath, normalize(filePath))
    if (resolved !== worktreePath && !resolved.startsWith(worktreePath + sep)) {
      throw new Error('Path traversal denied: file outside worktree')
    }
    await writeFile(resolved, resolvedContent, 'utf-8')
    await stageManagedWorktreePath(worktreePath, filePath)
  }

  async aiGenerate(
    runtime: AgentRuntime,
    prompt: string,
    cwd: string,
    extraArgs: string[] = [],
    options: AiGenerateOptions = {},
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutMs = Math.max(1_000, options.timeoutMs ?? DEFAULT_AI_GENERATE_TIMEOUT_MS)

      // Reject without spawning if already aborted (e.g. stop/quit fired first).
      if (options.signal?.aborted) {
        reject(new Error(`AI runtime "${runtime.id}" aborted before start`))
        return
      }

      const command = buildAiRuntimeCommand(runtime, prompt, extraArgs)
      const child = spawn(command.binary, command.args, {
        cwd,
        env: command.env ? { ...process.env, ...command.env } : undefined,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      inFlightAiGenerateChildren.add(child)

      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []
      let settled = false
      let killTimer: NodeJS.Timeout | undefined
      child.stdout?.on('data', (data: Buffer) => stdoutChunks.push(data))
      child.stderr?.on('data', (data: Buffer) => stderrChunks.push(data))

      const onAbort = () => {
        // Kill the child (SIGTERM, then SIGKILL after the grace period) and
        // reject immediately rather than waiting for 'close', which may never
        // fire if the child ignores SIGTERM.
        child.kill('SIGTERM')
        killTimer = setTimeout(() => child.kill('SIGKILL'), AI_GENERATE_KILL_GRACE_MS)
        killTimer.unref?.()
        settle(() => {
          reject(new Error(`AI runtime "${runtime.id}" aborted`))
        })
      }

      const timer = setTimeout(() => {
        // Reject immediately rather than waiting for 'close', which may never
        // fire if the child ignores SIGTERM or a grandchild inherits stdout.
        // Escalate to SIGKILL after a grace period so the process is reaped.
        child.kill('SIGTERM')
        killTimer = setTimeout(() => child.kill('SIGKILL'), AI_GENERATE_KILL_GRACE_MS)
        killTimer.unref?.()
        settle(() => {
          if (!options.silent) {
            console.error('[aiGenerate] timed out:', {
              runtime: runtime.id,
              timeoutMs,
            })
          }
          reject(new Error(
            `AI runtime "${runtime.id}" failed (timed out): timed out after ${timeoutMs / 1000} seconds`,
          ))
        })
      }, timeoutMs)

      const settle = (callback: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        inFlightAiGenerateChildren.delete(child)
        options.signal?.removeEventListener('abort', onAbort)
        callback()
      }

      options.signal?.addEventListener('abort', onAbort)

      child.on('error', (err) => {
        settle(() => {
          if (!options.silent) {
            console.error('[aiGenerate] spawn failed:', {
              runtime: runtime.id,
              message: err.message,
            })
          }
          reject(new Error(`AI runtime "${runtime.id}" failed to start: ${err.message}`))
        })
      })

      child.on('close', (code) => {
        if (killTimer) clearTimeout(killTimer)
        settle(() => {
          const stdout = Buffer.concat(stdoutChunks).toString('utf8')
          const stderr = Buffer.concat(stderrChunks).toString('utf8').trim()
          const result = parseAiRuntimeOutput(command.outputMode, stdout)
          if (code === 0 && result) {
            resolve(result)
            return
          }

          const failure = parseAiRuntimeFailure(command.outputMode, stdout, stderr)
          const codeLabel = code === null ? 'terminated' : `exit code ${code}`
          const message = failure
            ? `AI runtime "${runtime.id}" failed (${codeLabel}): ${failure}`
            : `AI runtime "${runtime.id}" returned no usable output (${codeLabel}).`

          if (!options.silent) {
            console.error('[aiGenerate] failed:', {
              runtime: runtime.id,
              code,
              message,
              stderr: stderr.slice(0, 500),
              stdoutTail: stdout.slice(-500),
            })
          }
          reject(new Error(message))
        })
      })

      // Swallow EPIPE etc. if the child exits/SIGKILLs while stdin is buffered;
      // stdin stream errors are not covered by child.on('error').
      child.stdin?.on('error', () => {})
      child.stdin?.end()
    })
  }

  async getPRContext(
    worktreePath: string,
    baseBranch: string
  ): Promise<{ commits: string; diffStat: string; diffPatch: string }> {
    // Large real-branch diffs easily exceed execFile's default 1MB maxBuffer;
    // without a larger limit the diff call rejects and the blanket catch below
    // would leave AI PR generation with zero context.
    const PR_CONTEXT_MAX_BUFFER = 50 * 1024 * 1024
    try {
      const [logResult, statResult, diffResult] = await Promise.all([
        execFileAsync('git', ['log', '--oneline', `${baseBranch}..HEAD`], { cwd: worktreePath, maxBuffer: PR_CONTEXT_MAX_BUFFER }),
        execFileAsync('git', ['diff', '--stat', `${baseBranch}..HEAD`], { cwd: worktreePath, maxBuffer: PR_CONTEXT_MAX_BUFFER }),
        execFileAsync('git', ['diff', `${baseBranch}..HEAD`], { cwd: worktreePath, maxBuffer: PR_CONTEXT_MAX_BUFFER }),
      ])
      return {
        commits: logResult.stdout.trim(),
        diffStat: statResult.stdout.trim(),
        diffPatch: diffResult.stdout.trim().slice(0, 6000),
      }
    } catch {
      return { commits: '', diffStat: '', diffPatch: '' }
    }
  }
}

function parseConflicts(porcelain: string): string[] {
  const conflicts: string[] = []
  for (const line of porcelain.split('\n')) {
    if (line.length < 4) continue
    const code = line.substring(0, 2)
    if (code === 'UU' || code === 'AA' || code === 'DD') {
      conflicts.push(line.substring(3))
    }
  }
  return conflicts
}
