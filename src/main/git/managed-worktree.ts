import { readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gitExec } from './git-exec'

const EXCLUDE_BLOCK_START = '# manifold: managed-worktree excludes start'
const EXCLUDE_BLOCK_END = '# manifold: managed-worktree excludes end'

// Ignore known AI-agent scratch paths in managed worktrees so bulk staging
// cannot accidentally poison the real git index with transient files.
const MANAGED_WORKTREE_EXCLUDES = [
  '/.claude/',
  '/.claude-plugin/',
  '/.cursor/',
  '/.cursor-plugin/',
  '/.opencode/',
  '/README.codex.md',
  '/docs/README.codex.md',
]

export async function prepareManagedWorktree(worktreePath: string): Promise<void> {
  await ensureManagedWorktreeGuards(worktreePath)
}

export async function ensureManagedWorktreeGuards(worktreePath: string): Promise<void> {
  // git answers absolutely for a linked worktree but *relatively* for an ordinary
  // repo (`.git/info/exclude`) — including a home workspace, which works the clone
  // itself. A relative path would be resolved against process.cwd() by readFile /
  // writeFile, so the guards would land in whatever repo the app happens to be
  // running from rather than the one they were handed. Anchoring to worktreePath
  // leaves an absolute answer untouched and pins a relative one to the right repo.
  const gitPath = (await gitExec(['rev-parse', '--git-path', 'info/exclude'], worktreePath)).trim()
  const excludePath = resolve(worktreePath, gitPath)

  let existing = ''
  try {
    existing = await readFile(excludePath, 'utf-8')
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException
    if (fsError.code !== 'ENOENT') throw error
  }

  if (existing.includes(EXCLUDE_BLOCK_START)) return

  const block = [
    EXCLUDE_BLOCK_START,
    ...MANAGED_WORKTREE_EXCLUDES,
    EXCLUDE_BLOCK_END,
  ].join('\n')

  const next = existing.length > 0 && !existing.endsWith('\n')
    ? `${existing}\n${block}\n`
    : `${existing}${block}\n`

  await writeFile(excludePath, next, 'utf-8')
}

export async function getManagedWorktreeStatus(worktreePath: string): Promise<string> {
  await ensureManagedWorktreeGuards(worktreePath)
  return runWithPoisonedIndexRecovery(worktreePath, () => (
    gitExec(['status', '--porcelain'], worktreePath)
  ))
}

export async function stageManagedWorktreePath(
  worktreePath: string,
  filePath: string
): Promise<void> {
  await stageManagedWorktreePaths(worktreePath, [filePath])
}

export async function stageManagedWorktreePaths(
  worktreePath: string,
  filePaths: string[]
): Promise<void> {
  if (filePaths.length === 0) return
  await ensureManagedWorktreeGuards(worktreePath)
  await runWithPoisonedIndexRecovery(worktreePath, async () => {
    await gitExec(['add', '--', ...filePaths], worktreePath)
  })
}

export async function unstageManagedWorktreePaths(
  worktreePath: string,
  filePaths: string[]
): Promise<void> {
  if (filePaths.length === 0) return
  await ensureManagedWorktreeGuards(worktreePath)
  await runWithPoisonedIndexRecovery(worktreePath, async () => {
    await gitExec(['restore', '--staged', '--', ...filePaths], worktreePath)
  })
}

/** Throw away working-tree changes. A tracked file goes back to what the index
 *  holds — so discarding the unstaged half of a staged-then-edited file keeps
 *  the staged half — while an untracked file is simply removed, which is the
 *  only thing "discard" can mean for a file git has never seen. */
export async function discardManagedWorktreePaths(
  worktreePath: string,
  filePaths: string[]
): Promise<void> {
  if (filePaths.length === 0) return
  await ensureManagedWorktreeGuards(worktreePath)
  await runWithPoisonedIndexRecovery(worktreePath, async () => {
    // -z, so a path with spaces or non-ASCII bytes comes back verbatim rather
    // than in git's quoted form and still matches what the caller passed.
    const listed = await gitExec(['ls-files', '-z', '--', ...filePaths], worktreePath)
    const tracked = new Set(listed.split('\0').filter(Boolean))
    const known = filePaths.filter((p) => tracked.has(p))
    const untracked = filePaths.filter((p) => !tracked.has(p))
    if (known.length > 0) await gitExec(['restore', '--worktree', '--', ...known], worktreePath)
    if (untracked.length > 0) await gitExec(['clean', '-fd', '--', ...untracked], worktreePath)
  })
}

/** Commit exactly what the index holds. The Source Control view stages
 *  explicitly, so unlike `commitManagedWorktree` this must not `add -A` first —
 *  that would commit the changes the user deliberately left unstaged. */
export async function commitManagedWorktreeIndex(
  worktreePath: string,
  message: string
): Promise<void> {
  const trimmedMessage = message.trim()

  await ensureManagedWorktreeGuards(worktreePath)
  await runWithPoisonedIndexRecovery(worktreePath, async () => {
    if (trimmedMessage) {
      await gitExec(['commit', '-m', trimmedMessage], worktreePath)
    } else {
      await gitExec(['commit', '--no-edit'], worktreePath)
    }
  })
}

export async function commitManagedWorktree(
  worktreePath: string,
  message: string
): Promise<void> {
  const trimmedMessage = message.trim()

  await ensureManagedWorktreeGuards(worktreePath)
  await runWithPoisonedIndexRecovery(worktreePath, async () => {
    await gitExec(['add', '-A'], worktreePath)
    if (trimmedMessage) {
      await gitExec(['commit', '-m', trimmedMessage], worktreePath)
    } else {
      await gitExec(['commit', '--no-edit'], worktreePath)
    }
  })
}

export function isPoisonedIndexError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /invalid object [0-9a-f]{40}/i.test(message) ||
    /unable to read [0-9a-f]{40}/i.test(message) ||
    /Error building trees/i.test(message)
  )
}

async function runWithPoisonedIndexRecovery<T>(
  worktreePath: string,
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!(await repairPoisonedIndex(worktreePath, error))) {
      throw error
    }
    return operation()
  }
}

async function repairPoisonedIndex(worktreePath: string, error: unknown): Promise<boolean> {
  if (!isPoisonedIndexError(error)) return false

  let indexPath = ''
  try {
    indexPath = (await gitExec(['rev-parse', '--git-path', 'index'], worktreePath)).trim()
  } catch {
    return false
  }

  if (!indexPath) return false

  try {
    await rename(indexPath, `${indexPath}.manifold-bad-${Date.now()}`)
  } catch {
    return false
  }

  await gitExec(['reset', '--mixed', 'HEAD'], worktreePath)
  await ensureManagedWorktreeGuards(worktreePath)
  return true
}

