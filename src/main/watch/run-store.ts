import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type {
  WatchFrameRef,
  WatchPlaylistEntryInput,
  WatchRunEntryState,
  WatchSessionSnapshot,
} from '../../shared/watch-types'
import type { AgentSession } from '../../shared/types'

const CONFIG_DIR = path.join(os.homedir(), '.manifold')
const STATE_FILE = path.join(CONFIG_DIR, 'watch-runs.json')
export const WATCH_RUNS_ROOT = path.join(CONFIG_DIR, 'watch-runs')

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
  aggregateDir: string
  createdAt: string
  updatedAt: string
  entries: WatchRunEntryState[]
}

interface StoredWatchRunState {
  sessions: Record<string, StoredWatchSession>
  runs: Record<string, StoredWatchRun>
}

export interface StartWatchRunOptions {
  runId: string
  sourceUrl: string
  aggregateDir: string
  entries: WatchPlaylistEntryInput[]
}

export class WatchRunStore {
  private state: StoredWatchRunState

  constructor(private stateFile: string = STATE_FILE) {
    this.state = this.loadFromDisk()
  }

  getSnapshot(session: AgentSession, isLiveSession: (sessionId: string) => boolean = () => true): WatchSessionSnapshot {
    const key = this.keyForSession(session)
    const sessionState = this.state.sessions[key]
    const run = sessionState?.activeRunId
      ? this.state.runs[sessionState.activeRunId]
      : undefined
    if (!sessionState || !run || run.sourceUrl !== sessionState.url) {
      return {
        url: sessionState?.url ?? '',
        playlistFrames: {},
        siblingByIndex: {},
        playlistDispatched: false,
      }
    }

    const playlistFrames: Record<number, WatchFrameRef[]> = {}
    const siblingByIndex: Record<number, string> = {}
    for (const entry of run.entries) {
      if (entry.frames.length > 0) playlistFrames[entry.originalIndex] = entry.frames
      if (entry.siblingSessionId && isLiveSession(entry.siblingSessionId)) {
        siblingByIndex[entry.originalIndex] = entry.siblingSessionId
      }
    }

    return {
      url: sessionState.url,
      playlistFrames,
      siblingByIndex,
      playlistDispatched: Object.keys(siblingByIndex).length > 0,
      runId: run.runId,
      entries: run.entries.map((entry) => ({ ...entry, frames: [...entry.frames] })),
    }
  }

  setUrl(session: AgentSession, url: string): WatchSessionSnapshot {
    const key = this.keyForSession(session)
    const previous = this.state.sessions[key]
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

  startRun(session: AgentSession, options: StartWatchRunOptions): void {
    const key = this.keyForSession(session)
    const now = new Date().toISOString()
    const entries = options.entries.map((entry, index): WatchRunEntryState => ({
      originalIndex: entry.originalIndex ?? index,
      url: entry.url,
      title: entry.title,
      question: entry.question,
      frames: [],
      status: 'queued',
    }))

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
      aggregateDir: options.aggregateDir,
      createdAt: now,
      updatedAt: now,
      entries,
    }
    this.writeToDisk()
  }

  markEntrySpawned(runId: string, originalIndex: number, sessionId: string): void {
    this.updateEntry(runId, originalIndex, (entry) => ({
      ...entry,
      siblingSessionId: sessionId,
      status: entry.status === 'queued' ? 'processing' : entry.status,
    }))
  }

  markEntryFrames(runId: string, originalIndex: number, frames: WatchFrameRef[]): void {
    this.updateEntry(runId, originalIndex, (entry) => ({
      ...entry,
      frames: frames.map((frame) => ({ ...frame })),
      status: entry.status === 'queued' ? 'processing' : entry.status,
    }))
  }

  markEntryReady(runId: string, originalIndex: number, workDir: string): void {
    this.updateEntry(runId, originalIndex, (entry) => ({
      ...entry,
      workDir,
      status: 'ready',
      error: undefined,
    }))
  }

  markEntryError(runId: string, originalIndex: number, error: string): void {
    this.updateEntry(runId, originalIndex, (entry) => ({
      ...entry,
      status: 'error',
      error,
    }))
  }

  private updateEntry(
    runId: string,
    originalIndex: number,
    updater: (entry: WatchRunEntryState) => WatchRunEntryState,
  ): void {
    const run = this.state.runs[runId]
    if (!run) return
    const index = run.entries.findIndex((entry) => entry.originalIndex === originalIndex)
    if (index === -1) return
    run.entries[index] = updater(run.entries[index])
    run.updatedAt = new Date().toISOString()
    this.writeToDisk()
  }

  private keyForSession(session: AgentSession): string {
    return session.worktreePath || session.id
  }

  private loadFromDisk(): StoredWatchRunState {
    try {
      if (!fs.existsSync(this.stateFile)) return { sessions: {}, runs: {} }
      const raw = fs.readFileSync(this.stateFile, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<StoredWatchRunState>
      return {
        sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
        runs: parsed.runs && typeof parsed.runs === 'object' ? parsed.runs : {},
      }
    } catch {
      return { sessions: {}, runs: {} }
    }
  }

  private writeToDisk(): void {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true })
    fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), 'utf-8')
  }
}
