import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { gitExec } from './git-exec'

function ghExec(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', args, {
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
        reject(new Error(`gh ${args[0]} failed (code ${code}): ${Buffer.concat(errChunks).toString('utf8')}`))
      } else {
        resolve(Buffer.concat(chunks).toString('utf8'))
      }
    })
  })
}

export class BranchCheckoutManager {
  constructor(private storagePath: string) {}

  async listBranches(projectPath: string): Promise<string[]> {
    // Fetch latest from all remotes (best-effort)
    try {
      await gitExec(['fetch', '--all', '--prune'], projectPath)
    } catch {
      // Fetch may fail (no remote, network issues) — continue with local data
    }

    const raw = await gitExec(['branch', '-a', '--format=%(refname:short)'], projectPath)

    // Get branches currently checked out in worktrees
    const worktreeBranches = await this.getWorktreeBranches(projectPath)

    const seen = new Set<string>()
    const branches: string[] = []

    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Strip origin/ prefix for remote branches
      const name = trimmed.startsWith('origin/') ? trimmed.slice('origin/'.length) : trimmed

      // Filter out HEAD, manifold/* worktree branches, and already-checked-out branches
      if (name === 'HEAD') continue
      if (name.startsWith('manifold/')) continue
      if (worktreeBranches.has(name)) continue

      if (!seen.has(name)) {
        seen.add(name)
        branches.push(name)
      }
    }

    return branches
  }

  private async getWorktreeBranches(projectPath: string): Promise<Set<string>> {
    const branches = new Set<string>()
    try {
      const raw = await gitExec(['worktree', 'list', '--porcelain'], projectPath)
      let worktreeIndex = -1
      let currentBranch: string | null = null

      for (const line of raw.split('\n')) {
        if (line.startsWith('worktree ')) {
          // Flush previous worktree's branch (skip first — that's the main repo checkout)
          if (worktreeIndex > 0 && currentBranch) {
            branches.add(currentBranch)
          }
          worktreeIndex++
          currentBranch = null
        } else if (line.startsWith('branch ')) {
          const fullRef = line.slice('branch '.length).trim()
          currentBranch = fullRef.replace('refs/heads/', '')
        } else if (line.trim() === '') {
          if (worktreeIndex > 0 && currentBranch) {
            branches.add(currentBranch)
          }
          currentBranch = null
        }
      }

      // Handle last entry (if no trailing empty line)
      if (worktreeIndex > 0 && currentBranch) {
        branches.add(currentBranch)
      }
    } catch {
      // If worktree list fails, return empty set — don't block branch listing
    }
    return branches
  }

  async fetchPRBranch(projectPath: string, prIdentifier: string): Promise<string> {
    const prNumber = this.parsePRNumber(prIdentifier)

    const branchName = (
      await ghExec(
        ['pr', 'view', prNumber, '--json', 'headRefName', '-q', '.headRefName'],
        projectPath
      )
    ).trim()

    // Fetch the branch from origin so it's available locally
    await gitExec(['fetch', 'origin', branchName], projectPath)

    return branchName
  }

  async createWorktreeFromBranch(
    projectPath: string,
    branch: string,
    projectName: string
  ): Promise<{ branch: string; path: string }> {
    const worktreeBase = path.join(this.storagePath, 'worktrees', projectName)
    fs.mkdirSync(worktreeBase, { recursive: true })

    const safeDirName = branch.replace(/\//g, '-')
    const worktreePath = path.join(worktreeBase, safeDirName)

    // No -b flag: check out existing branch, don't create new
    await gitExec(['worktree', 'add', worktreePath, branch], projectPath)

    return { branch, path: worktreePath }
  }

  private parsePRNumber(identifier: string): string {
    // Try raw number
    if (/^\d+$/.test(identifier.trim())) {
      return identifier.trim()
    }

    // Try GitHub URL: https://github.com/owner/repo/pull/123
    const urlMatch = identifier.match(/\/pull\/(\d+)/)
    if (urlMatch) {
      return urlMatch[1]
    }

    throw new Error(
      `Invalid PR identifier: "${identifier}". Use a PR number or GitHub URL.`
    )
  }
}
