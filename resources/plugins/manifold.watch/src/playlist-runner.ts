import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { runWatchPipeline } from './pipeline'
import { DEFAULT_WATCH_QUESTION } from './runner'
import { WATCH_RUNS_ROOT, type WatchRunStore, type WatchSessionInfo } from './run-store'
import type {
  TranscriptionSettings,
  WatchFrameRef,
  WatchPlaylistEntryInput,
  WatchPlaylistRunResult,
} from './shared-types'
import type { PipelineHooks } from './pipeline'

const PIPELINE_CONCURRENCY = 3
const AGENT_INPUT_DELAY_MS = 400
const SIBLING_READY_TIMEOUT_MS = 30_000
const AGGREGATES_ROOT = path.join(os.homedir(), '.manifold', 'watch-aggregates')

/** Narrow agent-spawn port over `manifold.agents` (wired by plugin.ts). The
 *  builtin drove the app's SessionManager directly; the plugin only needs
 *  these operations. The ready-poll lives main-side behind `whenReady`. */
export interface AgentPort {
  /** Spawn a sibling next to the base session; returns the sibling handle. */
  spawnSibling(baseSessionId: string, opts: { title?: string; groupId?: string }): Promise<SiblingHandle>
  /** Status of any session ('missing' when gone). */
  getStatus(sessionId: string): Promise<'running' | 'waiting' | 'done' | 'error' | 'missing'>
  /** Raw PTY input to any session (used for the meta-agent primer). */
  sendText(sessionId: string, text: string): Promise<void>
  /** Wait until a session's TUI prompt is up (status 'waiting'); false = timed out (non-fatal). */
  whenReady(sessionId: string, timeoutMs?: number): Promise<boolean>
}

export interface SiblingHandle {
  sessionId: string
  sendText(text: string): Promise<void>
  whenReady(timeoutMs?: number): Promise<boolean>
  kill(): Promise<void>
}

export interface RunPlaylistDeps {
  agents: AgentPort
  getTranscription: () => Promise<TranscriptionSettings>
  watchRunStore?: WatchRunStore
}

export interface RunPlaylistOptions {
  sessionId: string
  /** Base-session info for run-store persistence. The builtin read it off the
   *  SessionManager; the plugin's caller supplies it (from `manifold.workspace`).
   *  Falls back to an id-keyed shape when omitted. */
  sessionInfo?: WatchSessionInfo
  entries: WatchPlaylistEntryInput[]
  hooks?: (entryIndex: number) => PipelineHooks
  /** Called as soon as each entry's pipeline produces frames, so the UI can
   *  show thumbnails progressively per card. */
  onEntryFramesReady?: (entryIndex: number, frames: WatchFrameRef[]) => void
  /** Called once an entry's sibling agent has received its `/watch:watch`
   *  context command, so the UI can reveal the "Open agent" button only
   *  after the agent is ready to answer questions about the video. Revealing
   *  the button earlier (e.g. right after spawnSibling) lets the user open
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

  const baseStatus = await deps.agents.getStatus(opts.sessionId)
  if (baseStatus === 'missing') return { ok: false, error: 'Session not found' }
  if (baseStatus !== 'running' && baseStatus !== 'waiting') {
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

  const baseSession = opts.sessionInfo ?? { id: opts.sessionId, projectId: '', worktreePath: '' }
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
  const siblings: SiblingHandle[] = []
  const spawnedSessionIds: string[] = []
  for (let i = 0; i < opts.entries.length; i++) {
    try {
      const entry = opts.entries[i]
      const sibling = await deps.agents.spawnSibling(opts.sessionId, {
        title: entry.title ? `Watching: ${entry.title}` : 'Watching playlist entry',
        groupId: runId,
      })
      siblings.push(sibling)
      spawnedSessionIds.push(sibling.sessionId)
    } catch (err) {
      // Kill any siblings that were already spawned before the failure.
      for (const spawned of siblings) {
        spawned.kill().catch(() => { /* best effort */ })
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
    await primeMetaAgent(deps.agents, opts.sessionId, aggregateDir, opts.entries)
  }

  // Run pipelines with a concurrency cap. Each finished pipeline types its
  // slash command into the matching sibling agent. Transcription settings
  // are resolved once for the whole run.
  const transcription = await deps.getTranscription()
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
      const sibling = siblings[i]
      entryResults[i].sessionId = sibling.sessionId
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
        // Wait until the sibling's TUI prompt is rendered (status 'waiting');
        // typing earlier can land in the welcome banner. Proceeds on timeout
        // so we don't deadlock the playlist.
        await sibling.whenReady(SIBLING_READY_TIMEOUT_MS)
        await sibling.sendText(command)
        await new Promise((r) => setTimeout(r, AGENT_INPUT_DELAY_MS))
        await sibling.sendText('\r')
        // Now that the watch context has been queued to the agent, expose
        // the sibling to the renderer ("Open agent" button) and the store.
        deps.watchRunStore?.markEntrySpawned(runId, originalIndex, sibling.sessionId)
        try {
          opts.onEntrySpawned?.(originalIndex, sibling.sessionId)
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
        sibling.kill().catch(() => { /* best effort */ })
      }
    }
  })
  await Promise.all(workers)

  return { ok: true, spawnedSessionIds, entryResults, aggregateDir }
}

function entryWorkDir(workRoot: string, originalIndex: number): string {
  return path.join(workRoot, `entry-${String(originalIndex + 1).padStart(4, '0')}`)
}

async function primeMetaAgent(
  agents: AgentPort,
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
    await agents.whenReady(metaSessionId, SIBLING_READY_TIMEOUT_MS)
    await agents.sendText(metaSessionId, primer)
    await new Promise((r) => setTimeout(r, AGENT_INPUT_DELAY_MS))
    await agents.sendText(metaSessionId, '\r')
  } catch {
    // Meta agent may have closed mid-flight; non-fatal.
  }
}
