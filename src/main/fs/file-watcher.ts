import * as fs from 'node:fs'
import * as path from 'node:path'
import { FileTreeNode } from '../../shared/types'
import type { BrowserWindow } from 'electron'
import type { VerdictRecorder } from '../session/verdict-recorder'
import { gitStatus, gitCurrentBranch } from './file-watcher-utils'
import { buildFileTree } from './file-tree-builder'
import { NoopTreeWatcher, type TreeWatcher } from './tree-watcher'
import { VerdictPollForwarder, type HeadShaFn } from './verdict-poll-forwarder'
import { CheckoutStatusPoller, type GitStatusFn, type GitBranchFn } from './checkout-status-poller'

export class FileWatcher {
  private readonly polls: CheckoutStatusPoller
  private mainWindow: BrowserWindow | null = null
  private treeWatcher: TreeWatcher
  private readonly verdictForwarder: VerdictPollForwarder
  private onBranchChanged: ((sessionId: string, branch: string) => void) | null = null

  constructor(
    gitStatusFn?: GitStatusFn,
    treeWatcher?: TreeWatcher,
    headShaFn?: HeadShaFn,
    gitBranchFn?: GitBranchFn,
  ) {
    this.verdictForwarder = new VerdictPollForwarder(headShaFn)
    this.treeWatcher = treeWatcher ?? new NoopTreeWatcher()
    this.polls = new CheckoutStatusPoller(gitStatusFn ?? gitStatus, gitBranchFn ?? gitCurrentBranch, {
      primary: (checkout, sessionId, { changes, conflicts }, active, changed) => {
        this.sendToRenderer('files:changed', { sessionId, changes })
        this.sendToRenderer('agent:conflicts', { sessionId, conflicts })
        // Verdict I/O must not block status fan-out or reject outside the poll loop.
        void this.verdictForwarder.notifyGitChange(checkout, sessionId, active, changed).catch(() => {})
      },
      additional: (sessionId, source, { changes }) => {
        this.sendToRenderer('files:changed', { sessionId, changes, source })
      },
      branch: (sessionId, branch) => this.onBranchChanged?.(sessionId, branch),
    })
    // `rootPath` is the folder that changed. The renderer shows several folders
    // at once and reloads them by path, so an event that only named the agent
    // could not say which listing had gone stale.
    this.treeWatcher.setOnTreeChanged((_sessionId, rootPath) => {
      for (const sessionId of this.polls.primaryIds(rootPath)) {
        this.sendToRenderer('files:tree-changed', { sessionId, rootPath })
      }
    })
  }

  /** Called whenever a watched checkout reports a different branch than the last
   *  poll saw — the session's own branch moved (`git checkout -b`, a rename, or
   *  a switch the user made in the shell). */
  setOnBranchChanged(listener: (sessionId: string, branch: string) => void): void {
    this.onBranchChanged = listener
  }

  setVerdictRecorder(recorder: VerdictRecorder): void {
    this.verdictForwarder.setRecorder(recorder)
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
    this.polls.watchAdditionalDir(dirPath, sessionId)
  }

  unwatchAdditionalDir(dirPath: string, sessionId: string): void {
    this.polls.unwatchAdditionalDir(dirPath, sessionId)
  }

  watch(worktreePath: string, sessionId: string): void {
    const checkout = path.resolve(worktreePath)
    const firstPrimary = this.polls.primaryIds(checkout).length === 0
    this.polls.watch(checkout, sessionId)
    if (firstPrimary) this.treeWatcher.watch(checkout, sessionId)
  }

  async unwatch(worktreePath: string, sessionId?: string): Promise<void> {
    const checkout = path.resolve(worktreePath)
    const previous = this.polls.primaryIds(checkout)
    if (!previous.length || (sessionId !== undefined && !previous.includes(sessionId))) return
    this.polls.unwatch(checkout, sessionId)
    if (this.polls.primaryIds(checkout).length) {
      this.verdictForwarder.evict(checkout, sessionId)
      return
    }
    this.verdictForwarder.evict(checkout)
    await this.treeWatcher.unwatch(checkout)
  }

  async unwatchAll(): Promise<void> {
    this.polls.unwatchAll()
    this.verdictForwarder.clear()
    await this.treeWatcher.unwatchAll()
  }

  getFileTree(dirPath: string): Promise<FileTreeNode> {
    return buildFileTree(dirPath)
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
