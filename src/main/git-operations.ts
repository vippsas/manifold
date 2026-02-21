import { execFile, spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join, resolve, normalize } from 'node:path'
import { promisify } from 'node:util'
import type { AheadBehind } from '../shared/types'

const execFileAsync = promisify(execFile)

const AI_GENERATE_TIMEOUT_MS = 30_000

export class GitOperationsManager {
  async commit(worktreePath: string, message: string): Promise<void> {
    await execFileAsync('git', ['add', '.'], { cwd: worktreePath })
    await execFileAsync('git', ['commit', '-m', message], { cwd: worktreePath })
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
      const { stdout } = await execFileAsync(
        'git',
        ['status', '--porcelain'],
        { cwd: worktreePath }
      )
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
    await execFileAsync('git', ['add', '--', filePath], { cwd: worktreePath })
  }

  async aiGenerate(
    runtimeBinary: string,
    prompt: string,
    cwd: string
  ): Promise<string> {
    return new Promise((resolve) => {
      const child = spawn(runtimeBinary, ['-p'], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      const chunks: Buffer[] = []
      child.stdout.on('data', (data: Buffer) => chunks.push(data))

      const timer = setTimeout(() => {
        child.kill('SIGTERM')
      }, AI_GENERATE_TIMEOUT_MS)

      child.on('error', (err) => {
        clearTimeout(timer)
        console.error('[aiGenerate] spawn failed:', err.message)
        resolve('')
      })

      child.on('close', (code) => {
        clearTimeout(timer)
        const result = Buffer.concat(chunks).toString('utf8').trim()
        if (code === 0 && result) {
          resolve(result)
        } else {
          console.error('[aiGenerate] failed: exit code', code)
          resolve('')
        }
      })

      child.stdin.write(prompt)
      child.stdin.end()
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
