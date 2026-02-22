import * as fs from 'node:fs'
import * as path from 'node:path'
import { gitExec } from './git-exec'

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
    const seen = new Set<string>()
    const branches: string[] = []

    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Strip origin/ prefix for remote branches
      const name = trimmed.startsWith('origin/') ? trimmed.slice('origin/'.length) : trimmed

      // Filter out HEAD, manifold/* worktree branches
      if (name === 'HEAD') continue
      if (name.startsWith('manifold/')) continue

      if (!seen.has(name)) {
        seen.add(name)
        branches.push(name)
      }
    }

    return branches
  }
}
