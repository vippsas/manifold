import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { FileTreeNode, FileChange, FileChangeType } from '../shared/types'
import type { BrowserWindow } from 'electron'

const POLL_INTERVAL_MS = 2000

interface PollEntry {
  timer: ReturnType<typeof setInterval>
  sessionId: string
  lastStatus: string
  polling: boolean
}

type GitStatusFn = (cwd: string) => Promise<string>

export class FileWatcher {
  private polls: Map<string, PollEntry> = new Map()
  private mainWindow: BrowserWindow | null = null
  private gitStatusFn: GitStatusFn

  constructor(gitStatusFn?: GitStatusFn) {
    this.gitStatusFn = gitStatusFn ?? gitStatus
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  private sendToRenderer(channel: string, ...args: unknown[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args)
    }
  }

  watch(worktreePath: string, sessionId: string): void {
    if (this.polls.has(worktreePath)) return

    const entry: PollEntry = {
      timer: setInterval(() => this.poll(worktreePath), POLL_INTERVAL_MS),
      sessionId,
      lastStatus: '',
      polling: false,
    }
    this.polls.set(worktreePath, entry)

    // Run initial poll immediately
    void this.poll(worktreePath)
  }

  private async poll(worktreePath: string): Promise<void> {
    const entry = this.polls.get(worktreePath)
    if (!entry || entry.polling) return

    entry.polling = true
    try {
      const status = await this.gitStatusFn(worktreePath)
      if (status !== entry.lastStatus) {
        const { changes, conflicts } = parseStatusWithConflicts(status)
        entry.lastStatus = status
        this.sendToRenderer('files:changed', {
          sessionId: entry.sessionId,
          changes,
        })
        this.sendToRenderer('agent:conflicts', {
          sessionId: entry.sessionId,
          conflicts,
        })
      }
    } catch {
      // Worktree may not exist yet or git may fail — skip this tick
    } finally {
      entry.polling = false
    }
  }

  async unwatch(worktreePath: string): Promise<void> {
    const entry = this.polls.get(worktreePath)
    if (!entry) return
    clearInterval(entry.timer)
    this.polls.delete(worktreePath)
  }

  async unwatchAll(): Promise<void> {
    for (const [, entry] of this.polls) {
      clearInterval(entry.timer)
    }
    this.polls.clear()
  }

  getFileTree(dirPath: string): FileTreeNode {
    return this.buildTree(dirPath, path.basename(dirPath))
  }

  private buildTree(fullPath: string, name: string): FileTreeNode {
    let stat: fs.Stats
    try {
      stat = fs.statSync(fullPath)
    } catch {
      return { name, path: fullPath, isDirectory: false }
    }

    if (!stat.isDirectory()) {
      return { name, path: fullPath, isDirectory: false }
    }

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(fullPath, { withFileTypes: true })
    } catch {
      return { name, path: fullPath, isDirectory: true, children: [] }
    }

    const children = this.buildChildren(fullPath, entries)
    return { name, path: fullPath, isDirectory: true, children }
  }

  private buildChildren(parentPath: string, entries: fs.Dirent[]): FileTreeNode[] {
    return entries
      .filter(isVisibleEntry)
      .sort(directoriesFirstComparator)
      .map((entry) => this.buildTree(path.join(parentPath, entry.name), entry.name))
  }

  readFile(filePath: string): string {
    try {
      return fs.readFileSync(filePath, 'utf-8')
    } catch (err) {
      throw new Error(`Failed to read file ${filePath}: ${(err as Error).message}`)
    }
  }

  writeFile(filePath: string, content: string): void {
    try {
      fs.writeFileSync(filePath, content, 'utf-8')
    } catch (err) {
      throw new Error(`Failed to write file ${filePath}: ${(err as Error).message}`)
    }
  }

  deleteFile(filePath: string): void {
    try {
      fs.rmSync(filePath, { recursive: true })
    } catch (err) {
      throw new Error(`Failed to delete ${filePath}: ${(err as Error).message}`)
    }
  }

  renameFile(oldPath: string, newPath: string): void {
    if (fs.existsSync(newPath)) {
      throw new Error(`Target already exists: ${newPath}`)
    }
    fs.renameSync(oldPath, newPath)
  }
}

function gitStatus(cwd: string): Promise<string> {
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

function parseStatusWithConflicts(raw: string): { changes: FileChange[]; conflicts: string[] } {
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

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.cache', '.turbo',
  '.next',
  'target', 'vendor',
  '__pycache__', '.venv', 'venv', '.mypy_cache', '.pytest_cache', '.ruff_cache',
])

function isVisibleEntry(entry: fs.Dirent): boolean {
  return !(entry.isDirectory() && EXCLUDED_DIRS.has(entry.name))
}

function directoriesFirstComparator(a: fs.Dirent, b: fs.Dirent): number {
  if (a.isDirectory() && !b.isDirectory()) return -1
  if (!a.isDirectory() && b.isDirectory()) return 1
  return a.name.localeCompare(b.name)
}
