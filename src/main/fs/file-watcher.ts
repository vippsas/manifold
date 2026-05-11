import * as fs from 'node:fs'
import * as path from 'node:path'
import { FileTreeNode } from '../../shared/types'
import type { BrowserWindow } from 'electron'
import {
  gitStatus,
  parseStatusWithConflicts,
  buildChangeFingerprint,
  isVisibleEntry,
  directoriesFirstComparator,
} from './file-watcher-utils'
import { NoopTreeWatcher, type TreeWatcher } from './tree-watcher'

const POLL_INTERVAL_MS = 2000

interface PollEntry {
  timer: ReturnType<typeof setInterval>
  sessionId: string
  lastStatus: string
  lastChangeFingerprint: string
  polling: boolean
}

type GitStatusFn = (cwd: string) => Promise<string>

export class FileWatcher {
  private polls: Map<string, PollEntry> = new Map()
  private mainWindow: BrowserWindow | null = null
  private gitStatusFn: GitStatusFn
  private treeWatcher: TreeWatcher

  constructor(gitStatusFn?: GitStatusFn, treeWatcher?: TreeWatcher) {
    this.gitStatusFn = gitStatusFn ?? gitStatus
    this.treeWatcher = treeWatcher ?? new NoopTreeWatcher()
    this.treeWatcher.setOnTreeChanged((sessionId) => {
      this.sendToRenderer('files:tree-changed', { sessionId })
    })
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  private sendToRenderer(channel: string, ...args: unknown[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args)
    }
  }

  notifyTreeChanged(sessionId: string, source?: string): void {
    this.sendToRenderer('files:tree-changed', source ? { sessionId, source } : { sessionId })
  }

  watchAdditionalDir(dirPath: string, sessionId: string): void {
    const key = `additional:${sessionId}:${dirPath}`
    if (this.polls.has(key)) return

    const entry: PollEntry = {
      timer: setInterval(() => this.pollAdditionalDir(key, dirPath), POLL_INTERVAL_MS),
      sessionId,
      lastStatus: '',
      lastChangeFingerprint: '',
      lastDirFingerprint: '',
      polling: false,
    }
    this.polls.set(key, entry)

    void this.pollAdditionalDir(key, dirPath)
  }

  unwatchAdditionalDir(dirPath: string, sessionId: string): void {
    const key = `additional:${sessionId}:${dirPath}`
    const entry = this.polls.get(key)
    if (!entry) return
    clearInterval(entry.timer)
    this.polls.delete(key)
  }

  watch(worktreePath: string, sessionId: string): void {
    if (this.polls.has(worktreePath)) return

    const entry: PollEntry = {
      timer: setInterval(() => this.poll(worktreePath), POLL_INTERVAL_MS),
      sessionId,
      lastStatus: '',
      lastChangeFingerprint: '',
      polling: false,
    }
    this.polls.set(worktreePath, entry)
    this.treeWatcher.watch(worktreePath, sessionId)

    // Run initial poll immediately
    void this.poll(worktreePath)
  }

  private async poll(worktreePath: string): Promise<void> {
    const entry = this.polls.get(worktreePath)
    if (!entry || entry.polling) return

    entry.polling = true
    try {
      const status = await this.gitStatusFn(worktreePath)
      const { changes, conflicts } = parseStatusWithConflicts(status)
      const changeFingerprint = buildChangeFingerprint(worktreePath, changes)

      const gitChanged = status !== entry.lastStatus || changeFingerprint !== entry.lastChangeFingerprint

      if (gitChanged) {
        entry.lastStatus = status
        entry.lastChangeFingerprint = changeFingerprint
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

  private async pollAdditionalDir(key: string, dirPath: string): Promise<void> {
    const entry = this.polls.get(key)
    if (!entry || entry.polling) return

    entry.polling = true
    try {
      const status = await this.gitStatusFn(dirPath)
      const { changes, conflicts } = parseStatusWithConflicts(status)
      const changeFingerprint = buildChangeFingerprint(dirPath, changes)
      if (status !== entry.lastStatus || changeFingerprint !== entry.lastChangeFingerprint) {
        entry.lastStatus = status
        entry.lastChangeFingerprint = changeFingerprint
        this.sendToRenderer('files:changed', {
          sessionId: entry.sessionId,
          changes,
          source: dirPath,
        })
      }
    } catch {
      // Directory may not be a git repo or may not exist — skip
    } finally {
      entry.polling = false
    }
  }

  async unwatch(worktreePath: string): Promise<void> {
    const entry = this.polls.get(worktreePath)
    if (!entry) return
    clearInterval(entry.timer)
    this.polls.delete(worktreePath)
    await this.treeWatcher.unwatch(worktreePath)
  }

  async unwatchAll(): Promise<void> {
    for (const [, entry] of this.polls) {
      clearInterval(entry.timer)
    }
    this.polls.clear()
    await this.treeWatcher.unwatchAll()
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

  createFile(filePath: string): void {
    if (fs.existsSync(filePath)) {
      throw new Error(`File already exists: ${filePath}`)
    }
    try {
      fs.writeFileSync(filePath, '', 'utf-8')
    } catch (err) {
      throw new Error(`Failed to create file ${filePath}: ${(err as Error).message}`)
    }
  }

  createDir(dirPath: string): void {
    if (fs.existsSync(dirPath)) {
      throw new Error(`Directory already exists: ${dirPath}`)
    }
    try {
      fs.mkdirSync(dirPath)
    } catch (err) {
      throw new Error(`Failed to create directory ${dirPath}: ${(err as Error).message}`)
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

  importPaths(sourcePaths: string[], targetDir: string): string[] {
    if (!fs.statSync(targetDir).isDirectory()) {
      throw new Error(`Import target is not a directory: ${targetDir}`)
    }

    const uniqueSources = [...new Set(sourcePaths)]
    const copyPlan = uniqueSources.map((sourcePath) => {
      const stat = fs.statSync(sourcePath)
      const targetPath = path.join(targetDir, path.basename(sourcePath))
      return { sourcePath, targetPath, recursive: stat.isDirectory() }
    })

    const seenTargets = new Set<string>()
    for (const entry of copyPlan) {
      if (seenTargets.has(entry.targetPath)) {
        throw new Error(`Multiple dropped items would overwrite ${entry.targetPath}`)
      }
      if (fs.existsSync(entry.targetPath)) {
        throw new Error(`Target already exists: ${entry.targetPath}`)
      }
      seenTargets.add(entry.targetPath)
    }

    try {
      for (const entry of copyPlan) {
        fs.cpSync(entry.sourcePath, entry.targetPath, {
          recursive: entry.recursive,
          force: false,
          errorOnExist: true,
        })
      }
    } catch (err) {
      throw new Error(`Failed to import into ${targetDir}: ${(err as Error).message}`)
    }

    return copyPlan.map((entry) => entry.targetPath)
  }
}
