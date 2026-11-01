import * as path from 'node:path'
import { buildChangeFingerprint, parseStatusWithConflicts } from './file-watcher-utils'
import { isMissingGitError, isGitRepositoryError } from '../git/git-errors'

export type GitStatusFn = (cwd: string) => Promise<string>
export type GitBranchFn = (cwd: string) => Promise<string>
type StatusSnapshot = ReturnType<typeof parseStatusWithConflicts>

interface PrimarySubscriber {
  lastBranch: string
  notified: boolean
}

interface Producer {
  timer: ReturnType<typeof setInterval> | null
  primary: Map<string, PrimarySubscriber>
  additional: Map<string, string>
  snapshot?: StatusSnapshot
  status: string
  fingerprint: string
  branch: string
  branchVersion: number
  polling: boolean
  disabled: boolean
}

interface PollerEvents {
  primary: (checkout: string, sessionId: string, snapshot: StatusSnapshot, active: () => boolean, changed: boolean) => void
  additional: (sessionId: string, source: string, snapshot: StatusSnapshot) => void
  branch: (sessionId: string, branch: string) => void
}

/** One status request, fingerprint and timer per absolute checkout, independent of consumers. */
export class CheckoutStatusPoller {
  private producers = new Map<string, Producer>()

  constructor(
    private gitStatus: GitStatusFn,
    private gitBranch: GitBranchFn,
    private events: PollerEvents,
  ) {}

  primaryIds(checkout: string): string[] {
    return [...(this.producers.get(path.resolve(checkout))?.primary.keys() ?? [])]
  }

  watch(checkout: string, sessionId: string): void {
    const key = path.resolve(checkout)
    const entry = this.producer(key)
    if (entry.primary.has(sessionId)) return
    this.restartDisabled(key, entry)
    const subscriber: PrimarySubscriber = { lastBranch: '', notified: false }
    entry.primary.set(sessionId, subscriber)
    if (entry.snapshot) this.notifyPrimary(key, entry, sessionId, subscriber, false)
    if (!entry.snapshot) void this.poll(key, entry)
  }

  watchAdditionalDir(dir: string, sessionId: string): void {
    const key = path.resolve(dir)
    const entry = this.producer(key)
    if (entry.additional.has(sessionId)) return
    this.restartDisabled(key, entry)
    entry.additional.set(sessionId, dir)
    if (entry.snapshot) this.events.additional(sessionId, dir, entry.snapshot)
    if (!entry.snapshot) void this.poll(key, entry)
  }

  unwatch(checkout: string, sessionId?: string): void {
    const key = path.resolve(checkout)
    const entry = this.producers.get(key)
    if (!entry) return
    if (sessionId === undefined) entry.primary.clear()
    else entry.primary.delete(sessionId)
    if (!entry.primary.size) {
      entry.branch = ''
      entry.branchVersion++
    }
    this.removeUnused(key, entry)
  }

  unwatchAdditionalDir(dir: string, sessionId: string): void {
    const key = path.resolve(dir)
    const entry = this.producers.get(key)
    if (!entry) return
    entry.additional.delete(sessionId)
    this.removeUnused(key, entry)
  }

  unwatchAll(): void {
    for (const entry of this.producers.values()) {
      if (entry.timer) clearInterval(entry.timer)
    }
    this.producers.clear()
  }

  private producer(key: string): Producer {
    let entry = this.producers.get(key)
    if (!entry) {
      entry = {
        timer: null, primary: new Map(), additional: new Map(),
        status: '', fingerprint: '', branch: '', branchVersion: 0, polling: false, disabled: false,
      }
      const producer = entry
      entry.timer = setInterval(() => { void this.poll(key, producer) }, 2000)
      this.producers.set(key, entry)
    }
    return entry
  }

  private removeUnused(key: string, entry: Producer): void {
    if (entry.primary.size || entry.additional.size) return
    if (entry.timer) clearInterval(entry.timer)
    this.producers.delete(key)
  }

  private restartDisabled(key: string, entry: Producer): void {
    if (!entry.disabled) return
    entry.disabled = false
    entry.snapshot = undefined
    entry.status = ''
    entry.fingerprint = ''
    entry.branch = ''
    for (const subscriber of entry.primary.values()) {
      subscriber.lastBranch = ''
      subscriber.notified = false
    }
    entry.timer = setInterval(() => { void this.poll(key, entry) }, 2000)
  }

  private active(key: string, entry: Producer): boolean {
    return this.producers.get(key) === entry
  }

  private notifyPrimary(
    key: string, entry: Producer, sessionId: string, subscriber: PrimarySubscriber, changed: boolean,
  ): void {
    if (!this.active(key, entry) || entry.primary.get(sessionId) !== subscriber) return
    if (entry.snapshot && (changed || !subscriber.notified)) {
      subscriber.notified = true
      this.events.primary(key, sessionId, entry.snapshot,
        () => this.active(key, entry) && entry.primary.get(sessionId) === subscriber, changed)
    }
    if (entry.branch && entry.branch !== subscriber.lastBranch) {
      subscriber.lastBranch = entry.branch
      this.events.branch(sessionId, entry.branch)
    }
  }

  private async poll(key: string, entry: Producer): Promise<void> {
    if (!this.active(key, entry) || entry.polling || entry.disabled) return
    // Keep ticks from overlapping a slow Git request or fingerprint pass.
    entry.polling = true
    try {
      const status = await this.gitStatus(key)
      if (!this.active(key, entry)) return
      const snapshot = parseStatusWithConflicts(status)
      const fingerprint = await buildChangeFingerprint(key, snapshot.changes)
      if (!this.active(key, entry)) return
      const initial = !entry.snapshot
      const changed = status !== entry.status || fingerprint !== entry.fingerprint
      entry.status = status
      entry.fingerprint = fingerprint
      entry.snapshot = snapshot
      for (const [id, subscriber] of entry.primary) this.notifyPrimary(key, entry, id, subscriber, changed)
      if (changed || initial) {
        for (const [id, source] of entry.additional) this.events.additional(id, source, snapshot)
      }

      // Status alone cannot detect a branch move on a clean checkout. Additional
      // directories do not report branches; a primary joining later gets it next tick.
      if (entry.primary.size) {
        const branchVersion = entry.branchVersion
        const branch = await this.gitBranch(key).catch(() => '')
        if (!this.active(key, entry) || entry.branchVersion !== branchVersion) return
        entry.branch = branch && branch !== 'HEAD' ? branch : ''
        for (const [id, subscriber] of entry.primary) this.notifyPrimary(key, entry, id, subscriber, false)
      }
    } catch (err) {
      if (this.active(key, entry) && (isMissingGitError(err) || isGitRepositoryError(err))) {
        if (entry.timer) clearInterval(entry.timer)
        entry.timer = null
        entry.disabled = true
      }
      // Transient errors retry on the next tick.
    } finally {
      entry.polling = false
    }
  }
}
