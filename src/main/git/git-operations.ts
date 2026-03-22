import { execFile, spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join, resolve, normalize } from 'node:path'
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

interface AiGenerateOptions {
  timeoutMs?: number
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
    if (!resolved.startsWith(worktreePath)) {
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
      const command = buildAiRuntimeCommand(runtime, prompt, extraArgs)
      const child = spawn(command.binary, command.args, {
        cwd,
        env: command.env ? { ...process.env, ...command.env } : undefined,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []
      let settled = false
      let timedOut = false
      child.stdout?.on('data', (data: Buffer) => stdoutChunks.push(data))
      child.stderr?.on('data', (data: Buffer) => stderrChunks.push(data))

      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
      }, timeoutMs)

      const settle = (callback: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        callback()
      }

      child.on('error', (err) => {
        settle(() => {
          console.error('[aiGenerate] spawn failed:', {
            runtime: runtime.id,
            message: err.message,
          })
          reject(new Error(`AI runtime "${runtime.id}" failed to start: ${err.message}`))
        })
      })

      child.on('close', (code) => {
        settle(() => {
          const stdout = Buffer.concat(stdoutChunks).toString('utf8')
          const stderr = Buffer.concat(stderrChunks).toString('utf8').trim()
          const result = parseAiRuntimeOutput(command.outputMode, stdout)
          if (code === 0 && result) {
            resolve(result)
            return
          }

          const failure = timedOut
            ? `timed out after ${timeoutMs / 1000} seconds`
            : parseAiRuntimeFailure(command.outputMode, stdout, stderr)
          const codeLabel = code === null ? 'terminated' : `exit code ${code}`
          const message = failure
            ? `AI runtime "${runtime.id}" failed (${codeLabel}): ${failure}`
            : `AI runtime "${runtime.id}" returned no usable output (${codeLabel}).`

          console.error('[aiGenerate] failed:', {
            runtime: runtime.id,
            code,
            message,
            stderr: stderr.slice(0, 500),
            stdoutTail: stdout.slice(-500),
          })
          reject(new Error(message))
        })
      })

      child.stdin?.end()
    })
  }

  async getPRContext(
    worktreePath: string,
    baseBranch: string
  ): Promise<{ commits: string; diffStat: string; diffPatch: string }> {
    try {
      const [logResult, statResult, diffResult] = await Promise.all([
        execFileAsync('git', ['log', '--oneline', `${baseBranch}..HEAD`], { cwd: worktreePath }),
        execFileAsync('git', ['diff', '--stat', `${baseBranch}..HEAD`], { cwd: worktreePath }),
        execFileAsync('git', ['diff', `${baseBranch}..HEAD`], { cwd: worktreePath }),
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
