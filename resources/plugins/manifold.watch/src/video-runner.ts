import * as fs from 'node:fs'
import * as path from 'node:path'
import { runWatchPipeline } from './pipeline'
import { WATCH_RUNS_ROOT, type WatchRunStore, type WatchSessionInfo } from './run-store'
import {
  DEFAULT_WATCH_QUESTION,
  type TranscriptionSettings,
  type WatchFrameRef,
  type WatchVideoRunResult,
} from './shared-types'
import type { PipelineHooks } from './pipeline'

const AGENT_INPUT_DELAY_MS = 400
const AGENT_READY_TIMEOUT_MS = 30_000

/** Build the skill invocation typed into the base agent. The syntax is
 *  runtime-specific: Claude Code invokes a plugin command as `/watch:watch`,
 *  Codex references a skill as `$watch`. Both load the same bundled `watch`
 *  skill (installed into `~/.claude` and `~/.codex` by skill-installer.ts);
 *  only the trigger token differs, so Codex agents reject `/watch:watch` as an
 *  unrecognized command. Unknown/Claude runtimes keep the `/watch:watch` form. */
export function buildWatchCommand(runtimeId: string | undefined, workDir: string, question: string): string {
  const args = `"${workDir}" ${question}`
  const isCodex = runtimeId === 'codex' || runtimeId === 'ollama-codex'
  return isCodex ? `$watch ${args}` : `/watch:watch ${args}`
}

/** Narrow agent port over `manifold.agents` (wired by plugin.ts). The run
 *  drives the user's own (base) agent: once the pipeline has produced the
 *  report, the `/watch:watch` command is typed straight into its PTY. */
export interface AgentPort {
  /** Status of a session ('missing' when gone). */
  getStatus(sessionId: string): Promise<'running' | 'waiting' | 'done' | 'error' | 'missing'>
  /** Raw PTY input to a session. */
  sendText(sessionId: string, text: string): Promise<void>
  /** Wait until a session's TUI prompt is up (status 'waiting'); false = timed out (non-fatal). */
  whenReady(sessionId: string, timeoutMs?: number): Promise<boolean>
}

export interface RunVideoDeps {
  agents: AgentPort
  getTranscription: () => Promise<TranscriptionSettings>
  watchRunStore?: WatchRunStore
}

export interface RunVideoOptions {
  /** The base session the watch command is typed into. */
  sessionId: string
  /** Runtime of the base session; selects the skill-invocation syntax
   *  (`/watch:watch` for Claude Code, `$watch` for Codex). Defaults to the
   *  Claude Code form when absent. */
  runtimeId?: string
  /** Base-session info for run-store persistence. Falls back to an id-keyed
   *  shape when omitted. */
  sessionInfo?: WatchSessionInfo
  url: string
  /** The prompt sent with the command; DEFAULT_WATCH_QUESTION when blank. */
  question?: string
  /** The URL as typed in the panel. The run is recorded under it so the
   *  run-store snapshot re-attaches to the session's url (set via setUrl)
   *  even when `url` is the peek-normalized form. Defaults to `url`. */
  sourceUrl?: string
  hooks?: PipelineHooks
  /** Called as soon as the pipeline produces frames, so the UI can show
   *  thumbnails before the transcription stage finishes. */
  onFramesReady?: (frames: WatchFrameRef[]) => void
  /** Override the persisted work root (tests). Defaults to ~/.manifold/watch-runs/<runId>. */
  workRoot?: string
  /** Override the runId (tests). Defaults to a timestamp-based id. */
  runId?: string
  /** Optional signal to cancel an in-progress run. */
  signal?: AbortSignal
}

export async function runWatchVideo(
  deps: RunVideoDeps,
  opts: RunVideoOptions,
): Promise<WatchVideoRunResult> {
  const baseStatus = await deps.agents.getStatus(opts.sessionId)
  if (baseStatus === 'missing') return { ok: false, error: 'Session not found' }
  if (baseStatus !== 'running' && baseStatus !== 'waiting') {
    return { ok: false, error: 'Session is not running' }
  }

  const runId = opts.runId ?? `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`
  const workRoot = opts.workRoot ?? path.join(WATCH_RUNS_ROOT, runId)
  try {
    fs.mkdirSync(workRoot, { recursive: true })
  } catch (err) {
    return {
      ok: false,
      error: `Could not create watch run dir: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const baseSession = opts.sessionInfo ?? { id: opts.sessionId, projectId: '', worktreePath: '' }
  const question = opts.question?.trim() || DEFAULT_WATCH_QUESTION
  deps.watchRunStore?.startRun(baseSession, { runId, sourceUrl: opts.sourceUrl ?? opts.url, question })

  try {
    const hooks: PipelineHooks = { ...opts.hooks }
    if (opts.signal) hooks.signal = opts.signal
    const transcription = await deps.getTranscription()
    const result = await runWatchPipeline({ source: opts.url, workDir: workRoot }, transcription, hooks)
    const frames = result.frames.map((f) => ({
      path: f.path,
      timestampSeconds: f.timestampSeconds,
      hdPath: f.hdPath,
    }))
    deps.watchRunStore?.markFrames(runId, frames)
    try {
      opts.onFramesReady?.(frames)
    } catch {
      // Renderer may have unsubscribed; non-fatal.
    }
    const command = buildWatchCommand(opts.runtimeId, result.workDir, question)
    // Wait until the agent's TUI prompt is rendered (status 'waiting');
    // typing earlier can land in the welcome banner or mid-turn output.
    // Proceeds on timeout so a busy agent doesn't deadlock the run.
    await deps.agents.whenReady(opts.sessionId, AGENT_READY_TIMEOUT_MS)
    await deps.agents.sendText(opts.sessionId, command)
    await new Promise((r) => setTimeout(r, AGENT_INPUT_DELAY_MS))
    await deps.agents.sendText(opts.sessionId, '\r')
    deps.watchRunStore?.markReady(runId, result.workDir)
    return { ok: true, workDir: result.workDir }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Pipeline failed'
    deps.watchRunStore?.markError(runId, message)
    return { ok: false, error: message }
  }
}
