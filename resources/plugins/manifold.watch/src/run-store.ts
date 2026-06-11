import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type {
  WatchFrameRef,
  WatchRunStatus,
  WatchSessionSnapshot,
} from './shared-types'

// Minimal base-session shape the store needs. The builtin passed the app's
// full AgentSession (src/shared/types); the plugin decouples by requiring
// only the fields the store actually reads: `worktreePath`/`id` (session
// key, see keyForSession) and `projectId` (run metadata).
export interface WatchSessionInfo {
  id: string
  projectId: string
  worktreePath: string
}

// Decoupled from the app's buffered debug logger (src/main/app/debug-log);
// plugin-host console output is the plugin's log channel.
function debugLog(msg: string): void {
  console.error(`[watch-plugin] ${msg}`)
}

const CONFIG_DIR = path.join(os.homedir(), '.manifold')
const STATE_FILE = path.join(CONFIG_DIR, 'watch-runs.json')
export const WATCH_RUNS_ROOT = path.join(CONFIG_DIR, 'watch-runs')

// Cap retained runs across all sessions. Each run keeps extracted frames on
// disk (potentially hundreds of MB), so unbounded retention leaks storage.
const MAX_RETAINED_RUNS = 20

interface StoredWatchSession {
  key: string
  ownerSessionId: string
  ownerWorktreePath: string
  url: string
  activeRunId?: string
}

interface StoredWatchRun {
  runId: string
  key: string
  projectId: string
  ownerSessionId: string
  ownerWorktreePath: string
  sourceUrl: string
  createdAt: string
  updatedAt: string
  status: WatchRunStatus
  frames: WatchFrameRef[]
  workDir?: string
  error?: string
  question?: string
}

interface StoredWatchRunState {
  sessions: Record<string, StoredWatchSession>
  runs: Record<string, StoredWatchRun>
}

export interface StartWatchRunOptions {
  runId: string
  sourceUrl: string
  question?: string
}

export class WatchRunStore {
  private state: StoredWatchRunState
  // True when we couldn't read an existing state file (e.g. EACCES). We then
  // skip writes to avoid clobbering data we can't see.
  private readOnly = false

  constructor(
    private stateFile: string = STATE_FILE,
    private runsRoot: string = WATCH_RUNS_ROOT,
  ) {
    this.state = this.loadFromDisk()
  }

  getSnapshot(session: WatchSessionInfo): WatchSessionSnapshot {
    const key = this.keyForSession(session)
    const sessionState = this.state.sessions[key]
    const run = sessionState?.activeRunId
      ? this.state.runs[sessionState.activeRunId]
      : undefined
    if (!sessionState || !run || run.sourceUrl !== sessionState.url) {
      return { url: sessionState?.url ?? '', run: null }
    }
    return {
      url: sessionState.url,
      run: {
        runId: run.runId,
        status: run.status,
        frames: run.frames.map((frame) => ({ ...frame })),
        workDir: run.workDir,
        error: run.error,
        question: run.question,
      },
    }
  }

  setUrl(session: WatchSessionInfo, url: string): WatchSessionSnapshot {
    const key = this.keyForSession(session)
    const previous = this.state.sessions[key]
    if (
      previous &&
      previous.url === url &&
      previous.ownerSessionId === session.id &&
      previous.ownerWorktreePath === session.worktreePath
    ) {
      // No-op: avoid a synchronous JSON write per keystroke when the URL
      // input emits an unchanged value.
      return this.getSnapshot(session)
    }
    const activeRun = previous?.activeRunId ? this.state.runs[previous.activeRunId] : undefined
    this.state.sessions[key] = {
      key,
      ownerSessionId: session.id,
      ownerWorktreePath: session.worktreePath,
      url,
      activeRunId: activeRun?.sourceUrl === url ? activeRun.runId : undefined,
    }
    this.writeToDisk()
    return this.getSnapshot(session)
  }

  startRun(session: WatchSessionInfo, options: StartWatchRunOptions): void {
    const key = this.keyForSession(session)
    const now = new Date().toISOString()
    this.state.sessions[key] = {
      key,
      ownerSessionId: session.id,
      ownerWorktreePath: session.worktreePath,
      url: options.sourceUrl,
      activeRunId: options.runId,
    }
    this.state.runs[options.runId] = {
      runId: options.runId,
      key,
      projectId: session.projectId,
      ownerSessionId: session.id,
      ownerWorktreePath: session.worktreePath,
      sourceUrl: options.sourceUrl,
      createdAt: now,
      updatedAt: now,
      status: 'processing',
      frames: [],
      question: options.question,
    }
    this.evictOldRuns()
    this.writeToDisk()
  }

  /**
   * Drop the oldest runs once we exceed MAX_RETAINED_RUNS, deleting their
   * on-disk frame directories. Never evicts a run that is the active run of
   * any session.
   */
  private evictOldRuns(): void {
    const activeRunIds = new Set<string>()
    for (const session of Object.values(this.state.sessions)) {
      if (session.activeRunId) activeRunIds.add(session.activeRunId)
    }
    const evictable = Object.values(this.state.runs)
      .filter((run) => !activeRunIds.has(run.runId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const overflow = Object.keys(this.state.runs).length - MAX_RETAINED_RUNS
    if (overflow <= 0) return
    for (let i = 0; i < overflow && i < evictable.length; i++) {
      const run = evictable[i]
      delete this.state.runs[run.runId]
      this.removeRunDir(run.runId)
    }
  }

  private removeRunDir(runId: string): void {
    try { fs.rmSync(path.join(this.runsRoot, runId), { recursive: true, force: true }) } catch { /* best-effort */ }
  }

  markFrames(runId: string, frames: WatchFrameRef[]): void {
    this.updateRun(runId, (run) => ({
      ...run,
      frames: frames.map((frame) => ({ ...frame })),
    }))
  }

  markReady(runId: string, workDir: string): void {
    this.updateRun(runId, (run) => ({
      ...run,
      workDir,
      status: 'ready',
      error: undefined,
    }))
  }

  markError(runId: string, error: string): void {
    this.updateRun(runId, (run) => ({
      ...run,
      status: 'error',
      error,
    }))
  }

  private updateRun(runId: string, updater: (run: StoredWatchRun) => StoredWatchRun): void {
    const run = this.state.runs[runId]
    if (!run) return
    this.state.runs[runId] = { ...updater(run), updatedAt: new Date().toISOString() }
    this.writeToDisk()
  }

  private keyForSession(session: WatchSessionInfo): string {
    return session.worktreePath || session.id
  }

  private loadFromDisk(): StoredWatchRunState {
    let raw: string
    try {
      raw = fs.readFileSync(this.stateFile, 'utf-8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { sessions: {}, runs: {} }
      // Don't wipe a state file we couldn't read — that loses user history
      // forever. Log and bail with empty in-memory state; do not overwrite.
      debugLog(`WatchRunStore: cannot read ${this.stateFile}: ${err}`)
      this.readOnly = true
      return { sessions: {}, runs: {} }
    }
    try {
      const parsed = JSON.parse(raw) as Partial<StoredWatchRunState>
      const sessions = parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {}
      const runs: Record<string, StoredWatchRun> = {}
      for (const [runId, run] of Object.entries(parsed.runs ?? {})) {
        // Runs written by the retired playlist format carry an `entries`
        // array instead of `status`/`frames`; drop them (and their frame
        // dirs) rather than guessing a migration.
        if (run && typeof run.status === 'string' && Array.isArray(run.frames)) {
          runs[runId] = run
        } else {
          this.removeRunDir(runId)
        }
      }
      return { sessions, runs }
    } catch (err) {
      // Corruption: preserve the broken file for forensics before resetting.
      const backup = `${this.stateFile}.corrupt.${Date.now()}`
      try { fs.renameSync(this.stateFile, backup) } catch { /* best-effort */ }
      debugLog(`WatchRunStore: corrupt state file moved to ${backup}: ${err}`)
      return { sessions: {}, runs: {} }
    }
  }

  private writeToDisk(): void {
    if (this.readOnly) return
    try {
      fs.mkdirSync(path.dirname(this.stateFile), { recursive: true })
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), 'utf-8')
    } catch (err) {
      // Don't crash the run worker on disk-full — it'd mask the cause as a
      // pipeline failure. Log and leave state in memory; next write retries.
      debugLog(`WatchRunStore: failed to persist ${this.stateFile}: ${err}`)
    }
  }
}
