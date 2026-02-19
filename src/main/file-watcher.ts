import * as fs from 'node:fs'
import * as path from 'node:path'
import { watch as chokidarWatch, type FSWatcher } from 'chokidar'
import { FileTreeNode } from '../shared/types'
import type { BrowserWindow } from 'electron'

interface WatchEntry {
  watcher: FSWatcher
  sessionId: string
}

export class FileWatcher {
  private watchers: Map<string, WatchEntry> = new Map()
  private mainWindow: BrowserWindow | null = null

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  private sendToRenderer(channel: string, ...args: unknown[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args)
    }
  }

  watch(worktreePath: string, sessionId: string): void {
    if (this.watchers.has(worktreePath)) return

    const watcher = this.createChokidarWatcher(worktreePath)
    this.bindWatcherEvents(watcher, worktreePath, sessionId)
    this.watchers.set(worktreePath, { watcher, sessionId })
  }

  private createChokidarWatcher(worktreePath: string): FSWatcher {
    return chokidarWatch(worktreePath, {
      ignored: [
        /(^|[/\\])\../, // dotfiles
        '**/node_modules/**',
        '**/.git/**'
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    })
  }

  private bindWatcherEvents(watcher: FSWatcher, worktreePath: string, sessionId: string): void {
    const notify = (eventType: string, filePath: string): void => {
      const relativePath = path.relative(worktreePath, filePath)
      this.sendToRenderer('files:changed', {
        sessionId,
        changes: [{ path: relativePath, type: eventType }]
      })
    }

    watcher.on('add', (filePath: string) => notify('added', filePath))
    watcher.on('change', (filePath: string) => notify('modified', filePath))
    watcher.on('unlink', (filePath: string) => notify('deleted', filePath))
  }

  async unwatch(worktreePath: string): Promise<void> {
    const entry = this.watchers.get(worktreePath)
    if (!entry) return
    await entry.watcher.close()
    this.watchers.delete(worktreePath)
  }

  async unwatchAll(): Promise<void> {
    const closings: Promise<void>[] = []
    for (const [, entry] of this.watchers) {
      closings.push(entry.watcher.close())
    }
    await Promise.all(closings)
    this.watchers.clear()
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
}

function isVisibleEntry(entry: fs.Dirent): boolean {
  if (entry.name.startsWith('.')) return false
  if (entry.name === 'node_modules') return false
  return true
}

function directoriesFirstComparator(a: fs.Dirent, b: fs.Dirent): number {
  if (a.isDirectory() && !b.isDirectory()) return -1
  if (!a.isDirectory() && b.isDirectory()) return 1
  return a.name.localeCompare(b.name)
}
