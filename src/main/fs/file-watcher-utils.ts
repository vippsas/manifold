import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { FileChange, FileChangeType } from '../../shared/types'

export function gitStatus(cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['status', '--porcelain'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const chunks: Buffer[] = []
    child.stdout!.on('data', (data: Buffer) => chunks.push(data))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`git status failed (code ${code})`))
      else resolve(Buffer.concat(chunks).toString('utf8'))
    })
  })
}

export function parseStatusWithConflicts(raw: string): { changes: FileChange[]; conflicts: string[] } {
  const changes: FileChange[] = []
  const conflicts: string[] = []
  for (const line of raw.split('\n')) {
    if (line.length < 4) continue
    const code = line.substring(0, 2)
    const filePath = line.substring(3)

    if (code === 'UU' || code === 'AA' || code === 'DD') {
      conflicts.push(filePath)
    }

    let type: FileChangeType = 'modified'
    if (code.includes('A') || code.includes('?')) type = 'added'
    else if (code.includes('D')) type = 'deleted'

    changes.push({ path: filePath, type })
  }
  return { changes, conflicts }
}

export function buildChangeFingerprint(rootPath: string, changes: FileChange[]): string {
  return [...changes]
    .sort((a, b) => a.path.localeCompare(b.path) || a.type.localeCompare(b.type))
    .map((change) => {
      const absolutePath = path.join(rootPath, change.path)
      try {
        const stat = fs.statSync(absolutePath)
        const kind = stat.isDirectory() ? 'dir' : 'file'
        const size = typeof stat.size === 'number' ? stat.size : 0
        const modifiedAt = typeof stat.mtimeMs === 'number' ? stat.mtimeMs : 0
        return `${change.type}:${change.path}:${kind}:${size}:${modifiedAt}`
      } catch {
        return `${change.type}:${change.path}:missing`
      }
    })
    .join('|')
}

export function buildDirFingerprint(dirPath: string): string {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    return entries
      .filter(isVisibleEntry)
      .map((e) => `${e.name}:${e.isDirectory() ? 'd' : 'f'}`)
      .sort()
      .join('|')
  } catch {
    return ''
  }
}

export const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.cache', '.turbo',
  '.next',
  'target', 'vendor',
  '__pycache__', '.venv', 'venv', '.mypy_cache', '.pytest_cache', '.ruff_cache',
])

export function isVisibleEntry(entry: fs.Dirent): boolean {
  return !(entry.isDirectory() && EXCLUDED_DIRS.has(entry.name))
}

export function directoriesFirstComparator(a: fs.Dirent, b: fs.Dirent): number {
  if (a.isDirectory() && !b.isDirectory()) return -1
  if (!a.isDirectory() && b.isDirectory()) return 1
  return a.name.localeCompare(b.name)
}
