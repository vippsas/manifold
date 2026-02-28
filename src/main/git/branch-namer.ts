import * as path from 'node:path'
import { gitExec } from './git-exec'

const MAX_SLUG_LENGTH = 50

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-$/, '')
}

async function getExistingBranches(repoPath: string): Promise<Set<string>> {
  const stdout = await gitExec(['branch', '-a', '--format=%(refname:short)'], repoPath)
  return new Set(stdout.trim().split('\n').filter(Boolean))
}

export async function generateBranchName(repoPath: string, taskDescription: string): Promise<string> {
  const prefix = repoPrefix(repoPath)
  const slug = slugify(taskDescription)

  if (!slug) {
    return `${prefix}task-${Date.now()}`
  }

  const existing = await getExistingBranches(repoPath)
  const base = `${prefix}${slug}`

  if (!existing.has(base)) {
    return base
  }

  // Append numeric suffix to deduplicate
  let suffix = 2
  while (suffix <= 999) {
    const candidate = `${base}-${suffix}`
    if (!existing.has(candidate)) {
      return candidate
    }
    suffix++
  }

  return `${prefix}task-${Date.now()}`
}

export function repoPrefix(repoPath: string): string {
  return path.basename(repoPath).toLowerCase() + '/'
}

