import * as fs from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const DEBUG_LOG = join(homedir(), '.manifold', 'debug.log')

const FLUSH_DELAY_MS = 250
const MAX_BUFFERED_LINES = 5000

/**
 * Buffered, asynchronous debug logger.
 *
 * `debugLog` is called on hot paths — once per PTY chunk while agents stream
 * (see `session-stream-wirer.ts`). The previous implementation did a synchronous
 * `appendFileSync` on every call, which blocked the Electron main thread for
 * milliseconds once `debug.log` grew large (~3ms/call at 44MB, measured). With
 * 2+ concurrent streaming sessions this saturated the single main-process event
 * loop, backed up PTY reads, and hung the app — the same failure mode #333 fixed
 * for chat persistence, via a different write path.
 *
 * Lines are now coalesced in memory and appended asynchronously (one `appendFile`
 * per batch instead of one blocking write per line); `flushSync()` guarantees the
 * tail is persisted on quit. Appends always target EOF, so this stays compatible
 * with the auto-updater rewriting `debug.log` (see `auto-updater.ts`).
 */
export class DebugLogger {
  private buffer: string[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushing = false

  constructor(private readonly file: string, private readonly flushDelayMs: number = FLUSH_DELAY_MS) {}

  log(msg: string): void {
    this.buffer.push(`${new Date().toISOString()} ${msg}\n`)
    // Bound memory if a flush stalls (e.g. disk pressure): keep the newest lines.
    if (this.buffer.length > MAX_BUFFERED_LINES) {
      this.buffer.splice(0, this.buffer.length - MAX_BUFFERED_LINES)
    }
    this.scheduleFlush()
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.flushing || this.buffer.length === 0) return
    this.flushing = true
    const batch = this.buffer.join('')
    this.buffer = []
    try {
      await fs.promises.appendFile(this.file, batch, 'utf8')
    } catch {
      // Best-effort logging: never let a log write surface as an app error.
    } finally {
      this.flushing = false
      if (this.buffer.length > 0) this.scheduleFlush()
    }
  }

  /** Synchronous drain for the app-quit path so pending log lines aren't lost. */
  flushSync(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.buffer.length === 0) return
    const batch = this.buffer.join('')
    this.buffer = []
    try {
      fs.appendFileSync(this.file, batch, 'utf8')
    } catch {
      // Best-effort logging.
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      void this.flush()
    }, this.flushDelayMs)
    this.flushTimer.unref?.()
  }
}

const logger = new DebugLogger(DEBUG_LOG)

export function debugLog(msg: string): void {
  logger.log(msg)
}

export function flushDebugLog(): Promise<void> {
  return logger.flush()
}

/** Flush pending debug lines synchronously. Call on app quit. */
export function flushDebugLogSync(): void {
  logger.flushSync()
}
