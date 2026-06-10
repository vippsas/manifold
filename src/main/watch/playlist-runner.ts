import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { runWatchPipeline } from './pipeline'
import { DEFAULT_WATCH_QUESTION } from './runner'
import { WATCH_RUNS_ROOT, type WatchRunStore } from './run-store'
import type { SessionManager } from '../session/session-manager'
import type {
  TranscriptionSettings,
  WatchFrameRef,
  WatchPlaylistEntryInput,
  WatchPlaylistRunResult,
} from '../../shared/watch-types'
import type { PipelineHooks } from './pipeline'

const PIPELINE_CONCURRENCY = 3
const AGENT_INPUT_DELAY_MS = 400
const SIBLING_READY_TIMEOUT_MS = 30_000
const SIBLING_READY_POLL_MS = 250
const AGGREGATES_ROOT = path.join(os.homedir(), '.manifold', 'watch-aggregates')

export interface RunPlaylistDeps {
  sessionManager: SessionManager
  getTranscription: () => TranscriptionSettings
  watchRunStore?: WatchRunStore
}

export interface RunPlaylistOptions {
  sessionId: string
  entries: WatchPlaylistEntryInput[]
  hooks?: (entryIndex: number) => PipelineHooks
  /** Called as soon as each entry's pipeline produces frames, so the UI can
   *  show thumbnails progressively per card. */
  onEntryFramesReady?: (entryIndex: number, frames: WatchFrameRef[]) => void
  /** Called once an entry's sibling agent has received its `/watch:watch`
   *  context command, so the UI can reveal the "Open agent" button only
   *  after the agent is ready to answer questions about the video. Revealing
   *  the button earlier (e.g. right after createSession) lets the user open
   *  an empty agent and ask questions before the watch context lands. */
  onEntrySpawned?: (entryIndex: number, sessionId: string) => void
  /** Override the aggregates root (tests). Defaults to ~/.manifold/watch-aggregates. */
  aggregatesRoot?: string
  /** Override the persisted work root (tests). Defaults to ~/.manifold/watch-runs/<runId>. */
  workRoot?: string
  /** Override the runId (tests). Defaults to a timestamp-based id. */
  runId?: string
  /** Original video/playlist URL entered by the user. */
  sourceUrl?: string
  /** Optional signal to cancel an in-progress run (e.g. Watch panel closed). */
  signal?: AbortSignal
}

export async function runWatchPlaylist(
  deps: RunPlaylistDeps,
  opts: RunPlaylistOptions,
): Promise<WatchPlaylistRunResult> {
  if (opts.entries.length === 0) {
    return { ok: false, error: 'No entries' }
  }

  const baseSession = deps.sessionManager.getSession(opts.sessionId)
  if (!baseSession) return { ok: false, error: 'Session not found' }
  if (baseSession.status !== 'running' && baseSession.status !== 'waiting') {
    return { ok: false, error: 'Session is not running' }
  }

  // Aggregate dir for the per-sibling final analyses. The meta (base) agent
  // will be told where to read them from.
  const runId = opts.runId ?? `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`
  const aggregateDir = path.join(opts.aggregatesRoot ?? AGGREGATES_ROOT, runId)
  const workRoot = opts.workRoot ?? path.join(WATCH_RUNS_ROOT, runId)
  try {
    fs.mkdirSync(aggregateDir, { recursive: true })
    fs.mkdirSync(workRoot, { recursive: true })
  } catch (err) {
    return {
      ok: false,
      error: `Could not create watch run dir: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  deps.watchRunStore?.startRun(baseSession, {
    runId,
    sourceUrl: opts.sourceUrl ?? opts.entries[0]?.url ?? '',
    aggregateDir,
    entries: opts.entries,
  })

  // Spawn one sibling agent per entry upfront so each PTY is ready to
  // receive its `/watch:watch` command the moment its pipeline finishes.
  // We deliberately *do not* notify the renderer here — the "Open agent"
  // button must stay hidden until the agent has been primed with context
  // (see onEntrySpawned doc).
  const spawnedSessionIds: string[] = []
  for (let i = 0; i < opts.entries.length; i++) {
    try {
      const entry = opts.entries[i]
      const sibling = await deps.sessionManager.createSession({
        projectId: baseSession.projectId,
        runtimeId: baseSession.runtimeId,
        prompt: entry.title ? `Watching: ${entry.title}` : 'Watching playlist entry',
        existingWorktreePath: baseSession.worktreePath,
        groupId: runId,
      })
      spawnedSessionIds.push(sibling.id)
    } catch (err) {
      // Kill any siblings that were already spawned before the failure.
      for (const sid of spawnedSessionIds) {
        deps.sessionManager.killSession(sid).catch(() => { /* best effort */ })
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to spawn sibling agent',
        spawnedSessionIds,
      }
    }
  }

  // Prime the meta (base) agent so it knows where sibling answers will land.
  // Skipped for single-entry runs — there's nothing to synthesize across.
  if (opts.entries.length > 1) {
    await primeMetaAgent(deps.sessionManager, opts.sessionId, aggregateDir, opts.entries)
  }

  // Run pipelines with a concurrency cap. Each finished pipeline types its
  // slash command into the matching sibling agent.
  const transcription = deps.getTranscription()
  const entryResults: WatchPlaylistRunResult['entryResults'] = opts.entries.map((entry) => ({
    url: entry.url, ok: false,
  }))

  let next = 0
  const workers = Array.from({ length: Math.min(PIPELINE_CONCURRENCY, opts.entries.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= opts.entries.length) return
      const entry = opts.entries[i]
      const originalIndex = entry.originalIndex ?? i
      const siblingId = spawnedSessionIds[i]
      entryResults[i].sessionId = siblingId
      try {
        const pipelineHooks = opts.hooks?.(i) ?? {}
        if (opts.signal) pipelineHooks.signal = opts.signal
        const result = await runWatchPipeline(
          { source: entry.url, workDir: entryWorkDir(workRoot, originalIndex) },
          transcription,
          pipelineHooks,
        )
        const frames = result.frames.map((f) => ({
          path: f.path,
          timestampSeconds: f.timestampSeconds,
          hdPath: f.hdPath,
        }))
        deps.watchRunStore?.markEntryFrames(runId, originalIndex, frames)
        try {
          opts.onEntryFramesReady?.(originalIndex, frames)
        } catch {
          // Renderer may have unsubscribed; non-fatal.
        }
        const savePath = path.join(aggregateDir, `sibling-${i + 1}.md`)
        const question = entry.question?.trim() || DEFAULT_WATCH_QUESTION
        const augmented = `${question} After answering, also save your complete answer in markdown (no preamble) to "${savePath}" using the Write tool.`
        const command = `/watch:watch "${result.workDir}" ${augmented}`
        await waitUntilSiblingReady(deps.sessionManager, siblingId)
        deps.sessionManager.sendInput(siblingId, command)
        await new Promise((r) => setTimeout(r, AGENT_INPUT_DELAY_MS))
        deps.sessionManager.sendInput(siblingId, '\r')
        // Now that the watch context has been queued to the agent, expose
        // the sibling to the renderer ("Open agent" button) and the store.
        deps.watchRunStore?.markEntrySpawned(runId, originalIndex, siblingId)
        try {
          opts.onEntrySpawned?.(originalIndex, siblingId)
        } catch {
          // Renderer may have unsubscribed; non-fatal.
        }
        entryResults[i].ok = true
        entryResults[i].workDir = result.workDir
        deps.watchRunStore?.markEntryReady(runId, originalIndex, result.workDir)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Pipeline failed'
        entryResults[i].error = message
        deps.watchRunStore?.markEntryError(runId, originalIndex, message)
        // The sibling agent never received its /watch:watch context; kill it
        // to avoid leaving an orphaned PTY session.
        deps.sessionManager.killSession(siblingId).catch(() => { /* best effort */ })
      }
    }
  })
  await Promise.all(workers)

  return { ok: true, spawnedSessionIds, entryResults, aggregateDir }
}

function entryWorkDir(workRoot: string, originalIndex: number): string {
  return path.join(workRoot, `entry-${String(originalIndex + 1).padStart(4, '0')}`)
}

/**
 * Wait until a freshly-spawned sibling agent's TUI prompt is rendered.
 * StatusDetector flips status to 'waiting' when it sees the input glyph
 * (e.g., `❯` for Claude). Typing before this can land in the welcome banner.
 */
async function waitUntilSiblingReady(sm: SessionManager, sid: string): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < SIBLING_READY_TIMEOUT_MS) {
    const s = sm.getSession(sid)
    if (!s) return
    if (s.status === 'waiting') return
    await new Promise((r) => setTimeout(r, SIBLING_READY_POLL_MS))
  }
  // Timeout — proceed anyway so we don't deadlock the playlist.
}

async function primeMetaAgent(
  sessionManager: SessionManager,
  metaSessionId: string,
  aggregateDir: string,
  entries: WatchPlaylistEntryInput[],
): Promise<void> {
  const titleList = entries
    .map((e, i) => `(${i + 1}) ${e.title ? `"${e.title.replace(/"/g, "'")}"` : e.url}`)
    .join('; ')
  const lastPath = path.join(aggregateDir, `sibling-${entries.length}.md`)
  const firstPath = path.join(aggregateDir, 'sibling-1.md')
  const primer =
    `Note: ${entries.length} parallel agent(s) just started analyzing videos from a playlist: ` +
    `${titleList}. Their final analyses are being saved to "${firstPath}" through "${lastPath}". ` +
    `When I later ask cross-video or synthesis questions, please Read the relevant files from ` +
    `"${aggregateDir}" to ground your answers across all videos.`
  try {
    await waitUntilSiblingReady(sessionManager, metaSessionId)
    sessionManager.sendInput(metaSessionId, primer)
    await new Promise((r) => setTimeout(r, AGENT_INPUT_DELAY_MS))
    sessionManager.sendInput(metaSessionId, '\r')
  } catch {
    // Meta agent may have closed mid-flight; non-fatal.
  }
}
