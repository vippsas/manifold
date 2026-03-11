import { execFile } from 'node:child_process'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { gitExec } from './git-exec'

const EXCLUDE_BLOCK_START = '# manifold: managed-worktree excludes start'
const EXCLUDE_BLOCK_END = '# manifold: managed-worktree excludes end'
const execFileAsync = promisify(execFile)

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

interface ClaudePluginInfo {
  id: string
  enabled: boolean
}

export async function prepareManagedWorktree(worktreePath: string): Promise<void> {
  await ensureManagedWorktreeGuards(worktreePath)
  await disableClaudePluginsLocally(worktreePath)
}

export async function ensureManagedWorktreeGuards(worktreePath: string): Promise<void> {
  const excludePath = (await gitExec(['rev-parse', '--git-path', 'info/exclude'], worktreePath)).trim()

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
  await ensureManagedWorktreeGuards(worktreePath)
  await runWithPoisonedIndexRecovery(worktreePath, async () => {
    await gitExec(['add', '--', filePath], worktreePath)
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

async function disableClaudePluginsLocally(worktreePath: string): Promise<void> {
  let stdout = ''

  try {
    const result = await execFileAsync('claude', ['plugins', 'list', '--json'], { cwd: worktreePath })
    stdout = typeof result.stdout === 'string' ? result.stdout : result.stdout.toString('utf8')
  } catch {
    return
  }

  let plugins: ClaudePluginInfo[]
  try {
    plugins = JSON.parse(stdout) as ClaudePluginInfo[]
  } catch {
    return
  }

  for (const plugin of plugins) {
    if (!plugin.enabled) continue
    try {
      await execFileAsync(
        'claude',
        ['plugins', 'disable', '--scope', 'local', plugin.id],
        { cwd: worktreePath }
      )
    } catch {
      // Best-effort: if Claude isn't available or the local override cannot be
      // written, the git-side guards still protect staging.
    }
  }
}
