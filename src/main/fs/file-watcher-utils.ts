import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { FileChange, FileChangeType } from '../../shared/types'

const GIT_TIMEOUT_MS = 10000

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // stderr is 'ignore' (not 'pipe') so a git that floods >64KB of warnings to
    // stderr can't block on a full pipe and wedge the poll forever (#536).
    const child = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    const chunks: Buffer[] = []
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new Error(`git ${args[0]} timed out`))
    }, GIT_TIMEOUT_MS)

    child.stdout!.on('data', (data: Buffer) => chunks.push(data))
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) reject(new Error(`git ${args[0]} failed (code ${code})`))
      else resolve(Buffer.concat(chunks).toString('utf8'))
    })
  })
}

export function gitStatus(cwd: string): Promise<string> {
  return runGit(['status', '--porcelain'], cwd)
}

/** The branch checked out in `cwd`, or 'HEAD' when it is detached. */
export async function gitCurrentBranch(cwd: string): Promise<string> {
  return (await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)).trim()
}

// Git's unmerged porcelain codes: any entry containing 'U' (UU/AU/UA/DU/UD) plus
// the both-added/both-deleted pairs (AA/DD). Covers "deleted by us/them" so those
// conflicts reach the conflict UI (#540).
function isConflictCode(code: string): boolean {
  return code.includes('U') || code === 'AA' || code === 'DD'
}

export function parseStatusWithConflicts(raw: string): { changes: FileChange[]; conflicts: string[] } {
  const changes: FileChange[] = []
  const conflicts: string[] = []
  for (const line of raw.split('\n')) {
    if (line.length < 4) continue
    const code = line.substring(0, 2)
    const rawPath = line.substring(3)
    // Rename/copy entries render as "old -> new"; keep the destination path so
    // the fingerprint stats a real file and the renderer gets a valid path (#540).
    const filePath =
      (code[0] === 'R' || code[0] === 'C') && rawPath.includes(' -> ')
        ? rawPath.slice(rawPath.indexOf(' -> ') + 4)
        : rawPath

    if (isConflictCode(code)) {
      conflicts.push(filePath)
    }

    let type: FileChangeType = 'modified'
    if (code.includes('A') || code.includes('?')) type = 'added'
    else if (code.includes('D')) type = 'deleted'

    changes.push({ path: filePath, type })
  }
  return { changes, conflicts }
}

export async function buildChangeFingerprint(rootPath: string, changes: FileChange[]): Promise<string> {
  const sorted = [...changes].sort(
    (a, b) => a.path.localeCompare(b.path) || a.type.localeCompare(b.type),
  )
  // Async stat off the main thread, in parallel — a dirty tree of thousands of
  // entries no longer blocks the 2s poll tick on synchronous statSync (#538).
  const parts = await Promise.all(
    sorted.map(async (change) => {
      const absolutePath = path.join(rootPath, change.path)
      try {
        const stat = await fsp.stat(absolutePath)
        const kind = stat.isDirectory() ? 'dir' : 'file'
        const size = typeof stat.size === 'number' ? stat.size : 0
        const modifiedAt = typeof stat.mtimeMs === 'number' ? stat.mtimeMs : 0
        return `${change.type}:${change.path}:${kind}:${size}:${modifiedAt}`
      } catch {
        return `${change.type}:${change.path}:missing`
      }
    }),
  )
  return parts.join('|')
}

export const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.cache', '.turbo',
  '.next',
  'target', 'vendor',
  '__pycache__', '.venv', 'venv', '.mypy_cache', '.pytest_cache', '.ruff_cache',
])

export function isVisibleEntry(entry: fs.Dirent): boolean {
  // Symlinked dirs report isDirectory() === false, so check isSymbolicLink()
  // too — otherwise a symlinked node_modules (common in worktrees) slips past
  // the filter and buildFileTree follows it (statSync) into the whole tree.
  return !((entry.isDirectory() || entry.isSymbolicLink()) && EXCLUDED_DIRS.has(entry.name))
}

export function directoriesFirstComparator(a: fs.Dirent, b: fs.Dirent): number {
  if (a.isDirectory() && !b.isDirectory()) return -1
  if (!a.isDirectory() && b.isDirectory()) return 1
  return a.name.localeCompare(b.name)
}
