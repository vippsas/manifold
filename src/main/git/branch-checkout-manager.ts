import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { gitExec } from './git-exec'
import { prepareManagedWorktree } from './managed-worktree'
import type { BranchInfo, PRInfo } from '../../shared/types'

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

  async listBranches(projectPath: string): Promise<BranchInfo[]> {
    // Fetch latest from all remotes (best-effort)
    try {
      await gitExec(['fetch', '--all', '--prune'], projectPath)
    } catch {
      // Fetch may fail (no remote, network issues) — continue with local data
    }

    const raw = await gitExec(['branch', '-a', '--format=%(refname)'], projectPath)

    // Get branches currently checked out in worktrees
    const worktreeBranches = await this.getWorktreeBranches(projectPath)

    const localSet = new Set<string>()
    const remoteSet = new Set<string>()

    for (const line of raw.split('\n')) {
      const ref = line.trim()
      if (!ref) continue

      if (ref.startsWith('refs/heads/')) {
        const name = ref.slice('refs/heads/'.length)
        if (worktreeBranches.has(name)) continue
        localSet.add(name)
      } else if (ref.startsWith('refs/remotes/')) {
        // Skip remote HEAD pointers (e.g., refs/remotes/origin/HEAD)
        if (ref.endsWith('/HEAD')) continue
        // Strip refs/remotes/<remote>/ to get branch name
        const afterRemotes = ref.slice('refs/remotes/'.length)
        const slashIdx = afterRemotes.indexOf('/')
        if (slashIdx < 0) continue
        const name = afterRemotes.slice(slashIdx + 1)
        if (worktreeBranches.has(name)) continue
        remoteSet.add(name)
      }
    }

    const allNames = new Set([...localSet, ...remoteSet])
    const branches: BranchInfo[] = []
    for (const name of allNames) {
      const isLocal = localSet.has(name)
      const isRemote = remoteSet.has(name)
      branches.push({
        name,
        source: isLocal && isRemote ? 'both' : isLocal ? 'local' : 'remote',
      })
    }

    return branches
  }

  private async getWorktreeBranches(projectPath: string): Promise<Set<string>> {
    const branches = new Set<string>()
    try {
      const worktrees = await this.listWorktrees(projectPath)
      for (const worktree of worktrees.slice(1)) {
        if (worktree.branch) {
          branches.add(worktree.branch)
        }
      }
    } catch {
      // If worktree list fails, return empty set — don't block branch listing
    }
    return branches
  }

  async listOpenPRs(projectPath: string): Promise<PRInfo[]> {
    const raw = await ghExec(
      ['pr', 'list', '--state=open', '--json', 'number,title,headRefName,author', '--limit', '50'],
      projectPath
    )
    const parsed = JSON.parse(raw) as Array<{
      number: number
      title: string
      headRefName: string
      author: { login: string }
    }>
    return parsed.map((pr) => ({
      number: pr.number,
      title: pr.title,
      headRefName: pr.headRefName,
      author: pr.author.login,
    }))
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
    projectName: string,
    baseBranch: string
  ): Promise<{ branch: string; path: string }> {
    const worktreeBase = path.join(this.storagePath, 'worktrees', projectName)
    fs.mkdirSync(worktreeBase, { recursive: true })

    const safeDirName = branch.replace(/\//g, '-')
    const worktreePath = path.join(worktreeBase, safeDirName)
    const existingWorktreePath = await this.findExistingWorktreePath(projectPath, branch)

    if (existingWorktreePath) {
      await gitExec(['reset', '--mixed', 'HEAD'], existingWorktreePath).catch(() => {})
      await prepareManagedWorktree(existingWorktreePath)
      return { branch, path: existingWorktreePath }
    }

    // If the branch is currently checked out in the main repo, switch the main
    // repo to the base branch first — git refuses to create a worktree for a
    // branch that is already checked out elsewhere.
    const currentBranch = (await gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath)).trim()
    if (currentBranch === branch) {
      await gitExec(['checkout', baseBranch], projectPath)
    }

    // No -b flag: check out existing branch, don't create new
    await gitExec(['worktree', 'add', worktreePath, branch], projectPath)
    // Reset the freshly created worktree index so stale admin/index state cannot leak across sessions.
    await gitExec(['reset', '--mixed', 'HEAD'], worktreePath)
    await prepareManagedWorktree(worktreePath)

    return { branch, path: worktreePath }
  }

  private async findExistingWorktreePath(projectPath: string, branch: string): Promise<string | null> {
    const worktrees = await this.listWorktrees(projectPath)
    const existing = worktrees.find((worktree, index) => index > 0 && worktree.branch === branch)
    if (!existing) return null
    if (fs.existsSync(existing.path)) return existing.path
    await gitExec(['worktree', 'prune'], projectPath).catch(() => {})
    return null
  }

  private async listWorktrees(projectPath: string): Promise<Array<{ path: string; branch: string | null }>> {
    const raw = await gitExec(['worktree', 'list', '--porcelain'], projectPath)
    const worktrees: Array<{ path: string; branch: string | null }> = []
    let currentPath: string | null = null
    let currentBranch: string | null = null

    for (const line of raw.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (currentPath) {
          worktrees.push({ path: currentPath, branch: currentBranch })
        }
        currentPath = line.slice('worktree '.length).trim()
        currentBranch = null
      } else if (line.startsWith('branch ')) {
        const fullRef = line.slice('branch '.length).trim()
        currentBranch = fullRef.replace('refs/heads/', '')
      } else if (line.trim() === '' && currentPath) {
        worktrees.push({ path: currentPath, branch: currentBranch })
        currentPath = null
        currentBranch = null
      }
    }

    if (currentPath) {
      worktrees.push({ path: currentPath, branch: currentBranch })
    }

    return worktrees
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
