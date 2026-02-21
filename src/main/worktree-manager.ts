import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { generateBranchName, repoPrefix } from './branch-namer'
import { removeWorktreeMeta } from './worktree-meta'

export interface WorktreeInfo {
  branch: string
  path: string
}

/**
 * Runs git with explicit stdio to avoid Electron EBADF issues.
 * stdin is /dev/null, stdout/stderr are piped.
 */
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

export class WorktreeManager {
  constructor(private storagePath: string) {}

  private getWorktreeBase(projectName: string): string {
    return path.join(this.storagePath, 'worktrees', projectName)
  }

  async createWorktree(
    projectPath: string,
    baseBranch: string,
    projectName: string,
    branchName?: string
  ): Promise<WorktreeInfo> {
    const branch = branchName ?? (await generateBranchName(projectPath))
    const worktreeBase = this.getWorktreeBase(projectName)
    fs.mkdirSync(worktreeBase, { recursive: true })

    const safeDirName = branch.replace(/\//g, '-')
    const worktreePath = path.join(worktreeBase, safeDirName)

    // Create a new branch from the base branch and set up the worktree
    await gitExec(['worktree', 'add', '-b', branch, worktreePath, baseBranch], projectPath)

    return { branch, path: worktreePath }
  }

  async removeWorktree(projectPath: string, worktreePath: string): Promise<void> {
    // Get the branch associated with this worktree before removing it
    const worktrees = await this.listWorktrees(projectPath)
    const target = worktrees.find((w) => w.path === worktreePath)

    await gitExec(['worktree', 'remove', worktreePath, '--force'], projectPath)
    await removeWorktreeMeta(worktreePath)

    // Clean up the branch if we found one
    if (target) {
      try {
        await gitExec(['branch', '-D', target.branch], projectPath)
      } catch {
        // Branch may already be deleted or may be the current branch; ignore
      }
    }
  }

  async listWorktrees(projectPath: string): Promise<WorktreeInfo[]> {
    const prefix = repoPrefix(projectPath)
    const raw = await gitExec(['worktree', 'list', '--porcelain'], projectPath)
    const entries: WorktreeInfo[] = []
    let currentPath: string | null = null
    let currentBranch: string | null = null

    for (const line of raw.split('\n')) {
      if (line.startsWith('worktree ')) {
        currentPath = line.slice('worktree '.length).trim()
      } else if (line.startsWith('branch ')) {
        const fullRef = line.slice('branch '.length).trim()
        currentBranch = fullRef.replace('refs/heads/', '')
      } else if (line.trim() === '' && currentPath && currentBranch) {
        if (currentBranch.startsWith(prefix)) {
          entries.push({ branch: currentBranch, path: currentPath })
        }
        currentPath = null
        currentBranch = null
      }
    }

    // Handle last entry if file doesn't end with a blank line
    if (currentPath && currentBranch && currentBranch.startsWith(prefix)) {
      entries.push({ branch: currentBranch, path: currentPath })
    }

    return entries
  }
}
