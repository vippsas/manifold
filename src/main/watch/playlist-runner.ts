import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { runWatchPipeline } from './pipeline'
import { DEFAULT_WATCH_QUESTION } from './runner'
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
}

export interface RunPlaylistOptions {
  sessionId: string
  entries: WatchPlaylistEntryInput[]
  hooks?: (entryIndex: number) => PipelineHooks
  /** Called as soon as each entry's pipeline produces frames, so the UI can
   *  show thumbnails progressively per card. */
  onEntryFramesReady?: (entryIndex: number, frames: WatchFrameRef[]) => void
  /** Called as soon as each entry's sibling agent session is spawned, so the
   *  UI can reveal the "Open agent" button per entry without waiting for the
   *  whole playlist run to finish. */
  onEntrySpawned?: (entryIndex: number, sessionId: string) => void
  /** Override the aggregates root (tests). Defaults to ~/.manifold/watch-aggregates. */
  aggregatesRoot?: string
  /** Override the runId (tests). Defaults to a timestamp-based id. */
  runId?: string
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
  try {
    fs.mkdirSync(aggregateDir, { recursive: true })
  } catch (err) {
    return {
      ok: false,
      error: `Could not create aggregate dir: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // Spawn one sibling agent per entry upfront so dock tabs appear immediately.
  const spawnedSessionIds: string[] = []
  for (let i = 0; i < opts.entries.length; i++) {
    const entry = opts.entries[i]
    try {
      const sibling = await deps.sessionManager.createSession({
        projectId: baseSession.projectId,
        runtimeId: baseSession.runtimeId,
        prompt: entry.title ? `Watching: ${entry.title}` : 'Watching playlist entry',
        existingWorktreePath: baseSession.worktreePath,
        groupId: runId,
      })
      spawnedSessionIds.push(sibling.id)
      try {
        opts.onEntrySpawned?.(entry.originalIndex ?? i, sibling.id)
      } catch {
        // Renderer may have unsubscribed; non-fatal.
      }
    } catch (err) {
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
      const siblingId = spawnedSessionIds[i]
      entryResults[i].sessionId = siblingId
      try {
        const result = await runWatchPipeline(
          { source: entry.url },
          transcription,
          opts.hooks?.(i),
        )
        try {
          opts.onEntryFramesReady?.(entry.originalIndex ?? i, result.frames.map((f) => ({
            path: f.path,
            timestampSeconds: f.timestampSeconds,
            hdPath: f.hdPath,
          })))
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
        entryResults[i].ok = true
        entryResults[i].workDir = result.workDir
      } catch (err) {
        entryResults[i].error = err instanceof Error ? err.message : 'Pipeline failed'
      }
    }
  })
  await Promise.all(workers)

  return { ok: true, spawnedSessionIds, entryResults, aggregateDir }
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
