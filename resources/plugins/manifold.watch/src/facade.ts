// resources/plugins/manifold.watch/src/facade.ts
// Implements WatchFacade by wiring the ported pipeline modules onto the
// injected `manifold` API (passed in by plugin.ts → testable with a fake).
// Persistence design: ONE storage.global key (PERSIST_KEY) holds a
// Record<string, unknown> keyed by the former localStorage keys — persist()
// is read-modify-write over that single blob.
import type { ManifoldApi } from 'manifold'
import type { TranscriptionSettings, WatchVideoRunResult } from './shared-types'
import type { WatchFacade, RunVideoRequest } from './webview-host'
import type { AgentPort } from './video-runner'
import { runWatchVideo } from './video-runner'
import { WatchRunStore, type WatchSessionInfo } from './run-store'
import { detectWatchSetup, clearWatchSetupCache } from './setup-detector'
import { ensureBinaries } from './binary-installer'
import { ensureYtDlp } from './yt-dlp-fetcher'
import { readFrameAsDataUrl } from './frame-reader'
import { peekVideo } from './peek'

export const PERSIST_KEY = 'watch.webview-state'

// Ported verbatim from src/renderer/hooks/useWatchPanel.ts (IMPROVE_PROMPT_META),
// which the builtin sent through `git:ai-generate`; the plugin sends it via
// `manifold.lm` instead.
export const IMPROVE_PROMPT_META = [
  'You will receive a prompt that a user wants to send to an AI agent that analyzes a video',
  '(transcript + extracted frames). Rewrite it to be clearer, more specific, and more likely to',
  'elicit a useful answer. Preserve the user\'s intent and constraints (e.g. requested length).',
  'Return ONLY the improved prompt text — no preamble, no explanation, no surrounding quotes,',
  'no markdown.',
  '',
  'Original prompt:',
].join('\n')

/** Narrow `manifold.agents` down to the AgentPort the video runner drives. */
export function createAgentPort(agents: ManifoldApi['agents']): AgentPort {
  return {
    async getStatus(sessionId) {
      const agent = agents.getAgent(sessionId)
      return agent ? agent.getStatus() : 'missing'
    },
    async sendText(sessionId, text) {
      const agent = agents.getAgent(sessionId)
      if (!agent) throw new Error(`no agent session ${sessionId}`)
      await agent.sendText(text)
    },
    async whenReady(sessionId, timeoutMs) {
      const agent = agents.getAgent(sessionId)
      if (!agent) return false
      return agent.whenReady(timeoutMs)
    },
  }
}

/** Unconfigured app settings (undefined) → provider 'none' (builtin parity). */
export async function resolveTranscription(api: Pick<ManifoldApi, 'transcription'>): Promise<TranscriptionSettings> {
  return (await api.transcription.get()) ?? { provider: 'none' }
}

export function createWatchFacade(manifold: ManifoldApi): WatchFacade {
  const agentPort = createAgentPort(manifold.agents)
  // Run-store singleton over the same ~/.manifold/watch-runs.json as the
  // builtin; lazy so merely constructing the facade touches no disk.
  let store: WatchRunStore | undefined
  const getStore = (): WatchRunStore => (store ??= new WatchRunStore())

  // Base-session info for run-store keys (worktreePath) + run metadata.
  const sessionInfo = (): WatchSessionInfo | undefined => {
    const session = manifold.workspace.activeSession
    if (!session) return undefined
    return {
      id: session.id,
      projectId: manifold.workspace.activeProject?.id ?? '',
      worktreePath: session.worktreePath ?? '',
    }
  }

  const getPersisted = async (): Promise<Record<string, unknown>> =>
    (await manifold.storage.global.get<Record<string, unknown>>(PERSIST_KEY)) ?? {}

  return {
    getActiveSessionId: () => manifold.agents.activeAgent?.sessionId ?? null,

    async getSnapshot() {
      const info = sessionInfo()
      if (!info) return null
      return getStore().getSnapshot(info)
    },

    async setupStatus() {
      const transcription = await resolveTranscription(manifold)
      return detectWatchSetup({ getTranscription: () => transcription })
    },

    getPersisted,
    async persist(key, value) {
      const all = await getPersisted()
      await manifold.storage.global.update(PERSIST_KEY, { ...all, [key]: value })
    },

    peek: (url) => peekVideo(url),

    async runVideo({ sessionId, url, question, sourceUrl, signal, onProgress }: RunVideoRequest): Promise<WatchVideoRunResult> {
      return runWatchVideo(
        {
          agents: agentPort,
          watchRunStore: getStore(),
          getTranscription: () => resolveTranscription(manifold),
        },
        {
          sessionId,
          sessionInfo: sessionInfo(),
          url,
          question,
          sourceUrl,
          signal,
          hooks: {
            onLog: (line) => onProgress('log', line),
            onStage: (stage) => onProgress('stage', stage),
          },
          onFramesReady: (frames) => onProgress('frames', frames),
        },
      )
    },

    async installBinaries(onLog) {
      clearWatchSetupCache()
      const result = await ensureBinaries(['ffmpeg'], { onLog })
      try {
        await ensureYtDlp({ onLog })
        result.installed.push('yt-dlp')
      } catch (err) {
        result.errors.push({ binary: 'yt-dlp', message: err instanceof Error ? err.message : String(err) })
      }
      clearWatchSetupCache()
      if (result.errors.length === 0) return { ok: true }
      return { ok: false, error: result.errors.map((e) => `${e.binary}: ${e.message}`).join('\n') }
    },

    readFrame: async (framePath) => readFrameAsDataUrl(framePath),

    async setUrl(url) {
      const info = sessionInfo()
      if (!info) return
      getStore().setUrl(info, url)
    },

    async improvePrompt(draft) {
      const trimmed = draft.trim()
      if (!trimmed) throw new Error('Question is empty')
      const models = await manifold.lm.selectChatModels()
      const model = models[0]
      if (!model) throw new Error('no language model available — is a default runtime configured?')
      const res = await model.sendRequest(`${IMPROVE_PROMPT_META}\n${trimmed}`)
      return res.text.trim() || trimmed
    },
  }
}
