import { runWatchPipeline } from './pipeline'
import type { SessionManager } from '../session/session-manager'
import type { TranscriptionSettings, WatchRunResult } from '../../shared/watch-types'
import type { PipelineHooks } from './pipeline'

export interface RunWatchDeps {
  sessionManager: SessionManager
  getTranscription: () => TranscriptionSettings
}

export interface RunWatchOptions {
  sessionId: string
  source: string
  question?: string
  hooks?: PipelineHooks
}

export async function runWatch(deps: RunWatchDeps, opts: RunWatchOptions): Promise<WatchRunResult> {
  const trimmed = opts.source.trim()
  if (!trimmed) return { ok: false, error: 'Source is required' }

  const session = deps.sessionManager.getSession(opts.sessionId)
  if (!session) return { ok: false, error: 'Session not found' }
  if (session.status !== 'running' && session.status !== 'waiting') {
    return { ok: false, error: 'Session is not running' }
  }

  let result
  try {
    result = await runWatchPipeline(
      { source: trimmed },
      deps.getTranscription(),
      opts.hooks,
    )
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Pipeline failed' }
  }

  const question = opts.question?.trim()
  // Quote the workdir path so paths with spaces survive Claude Code's tokenizer.
  const command = question
    ? `/watch:watch "${result.workDir}" ${question}`
    : `/watch:watch "${result.workDir}"`

  try {
    // Type the slash command, then submit it with Enter after a short delay so
    // the agent's TUI registers the command before the carriage return.
    deps.sessionManager.sendInput(opts.sessionId, command)
    await new Promise((r) => setTimeout(r, 400))
    deps.sessionManager.sendInput(opts.sessionId, '\r')
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to write to PTY',
      workDir: result.workDir,
    }
  }

  return {
    ok: true,
    workDir: result.workDir,
    reportPath: result.reportPath,
    frameCount: result.frames.length,
    frames: result.frames.map((f) => ({
      path: f.path,
      timestampSeconds: f.timestampSeconds,
      hdPath: f.hdPath,
    })),
    transcriptSource: result.transcript.source,
  }
}
