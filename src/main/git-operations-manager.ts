import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { StatusDetail, AheadBehind } from '../shared/types'

const AI_GENERATE_TIMEOUT_MS = 15_000

function gitExec(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []

    child.stdout!.on('data', (data: Buffer) => chunks.push(data))
    child.stderr!.on('data', (data: Buffer) => errChunks.push(data))

    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString('utf8')
        reject(new Error(`git ${args[0]} failed (code ${code}): ${stderr}`))
      } else {
        resolve(Buffer.concat(chunks).toString('utf8'))
      }
    })
  })
}

export class GitOperationsManager {
  async commit(worktreePath: string, message: string): Promise<void> {
    await gitExec(['add', '.'], worktreePath)
    await gitExec(['commit', '-m', message], worktreePath)
  }

  async getStatusDetail(worktreePath: string): Promise<StatusDetail> {
    const stdout = await gitExec(['status', '--porcelain'], worktreePath)
    const conflicts: string[] = []
    const staged: string[] = []
    const unstaged: string[] = []

    for (const line of stdout.split('\n')) {
      if (line.length < 4) continue
      const xy = line.substring(0, 2)
      const filePath = line.substring(3)

      if (xy === 'UU' || xy === 'AA' || xy === 'DD') {
        conflicts.push(filePath)
      } else {
        const x = xy[0]
        const y = xy[1]
        if (x !== ' ' && x !== '?') staged.push(filePath)
        if (y !== ' ' && y !== '?') unstaged.push(filePath)
        if (xy.startsWith('?')) unstaged.push(filePath)
      }
    }

    return { conflicts, staged, unstaged }
  }

  async getAheadBehind(worktreePath: string, baseBranch: string): Promise<AheadBehind> {
    const stdout = await gitExec(
      ['rev-list', '--left-right', '--count', `${baseBranch}...HEAD`],
      worktreePath
    )
    const parts = stdout.trim().split(/\s+/)
    const behind = parseInt(parts[0], 10) || 0
    const ahead = parseInt(parts[1], 10) || 0
    return { ahead, behind }
  }

  async resolveConflict(
    worktreePath: string,
    filePath: string,
    resolvedContent: string
  ): Promise<void> {
    const fullPath = join(worktreePath, filePath)
    await writeFile(fullPath, resolvedContent, 'utf-8')
    await gitExec(['add', filePath], worktreePath)
  }

  async aiGenerate(runtimeBinary: string, flag: string, prompt: string, cwd: string): Promise<string> {
    return new Promise((resolve) => {
      const child = spawn(runtimeBinary, [flag, prompt], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      const chunks: Buffer[] = []
      let settled = false

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          child.kill()
          resolve('')
        }
      }, AI_GENERATE_TIMEOUT_MS)

      child.stdout!.on('data', (data: Buffer) => chunks.push(data))

      child.on('error', () => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve('')
        }
      })

      child.on('close', () => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          resolve(Buffer.concat(chunks).toString('utf8').trim())
        }
      })
    })
  }
}
