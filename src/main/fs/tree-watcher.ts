import * as path from 'node:path'
import chokidar, { FSWatcher } from 'chokidar'
import { EXCLUDED_DIRS } from './file-watcher-utils'

const DEBOUNCE_MS = 200

export interface TreeWatcher {
  watch(rootPath: string, sessionId: string): void
  unwatch(rootPath: string): Promise<void>
  unwatchAll(): Promise<void>
  setOnTreeChanged(fn: (sessionId: string) => void): void
}

interface WatchEntry {
  watcher: FSWatcher
  sessionId: string
  debounceTimer: ReturnType<typeof setTimeout> | null
}

export class ChokidarTreeWatcher implements TreeWatcher {
  private watchers = new Map<string, WatchEntry>()
  private onTreeChanged: ((sessionId: string) => void) | null = null

  setOnTreeChanged(fn: (sessionId: string) => void): void {
    this.onTreeChanged = fn
  }

  watch(rootPath: string, sessionId: string): void {
    if (this.watchers.has(rootPath)) return

    const watcher = chokidar.watch(rootPath, {
      ignored: (p: string) => isExcluded(rootPath, p),
      ignoreInitial: true,
      persistent: true,
      followSymlinks: false,
    })

    const entry: WatchEntry = { watcher, sessionId, debounceTimer: null }
    this.watchers.set(rootPath, entry)

    const triggerChange = (): void => {
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
      entry.debounceTimer = setTimeout(() => {
        entry.debounceTimer = null
        this.onTreeChanged?.(sessionId)
      }, DEBOUNCE_MS)
    }

    watcher.on('add', triggerChange)
    watcher.on('unlink', triggerChange)
    watcher.on('addDir', triggerChange)
    watcher.on('unlinkDir', triggerChange)
    watcher.on('error', () => {
      // Swallow watcher errors; polling layer continues to provide updates.
    })
  }

  async unwatch(rootPath: string): Promise<void> {
    const entry = this.watchers.get(rootPath)
    if (!entry) return
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
    this.watchers.delete(rootPath)
    await entry.watcher.close()
  }

  async unwatchAll(): Promise<void> {
    const entries = [...this.watchers.values()]
    this.watchers.clear()
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
        await entry.watcher.close()
      }),
    )
  }
}

export class NoopTreeWatcher implements TreeWatcher {
  watch(): void {}
  async unwatch(): Promise<void> {}
  async unwatchAll(): Promise<void> {}
  setOnTreeChanged(): void {}
}

function isExcluded(rootPath: string, candidate: string): boolean {
  if (candidate === rootPath) return false
  const rel = path.relative(rootPath, candidate)
  if (!rel || rel.startsWith('..')) return false
  for (const seg of rel.split(path.sep)) {
    if (EXCLUDED_DIRS.has(seg)) return true
  }
  return false
}
