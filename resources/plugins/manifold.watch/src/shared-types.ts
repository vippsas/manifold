// Ported from src/shared/watch-types.ts. AiServiceProvider/AiServiceSettings are
// inlined (copied from src/shared/plugins/api-types.ts) because the plugin
// cannot import app `src/` modules.

/** App-level AI-service settings (transcription + chat keys), shared with core
 *  consumers (settings UI, verdict-recorder, prompt-summarizer). Exposed to
 *  built-in plugins via `manifold.transcription` (gated by `transcription:read`). */
export type AiServiceProvider = 'openai' | 'azure' | 'none'

export interface AiServiceSettings {
  provider: AiServiceProvider
  openaiApiKey?: string
  azureApiKey?: string
  azureEndpoint?: string
  azureDeployment?: string          // transcription deployment (existing)
  chatModel?: string                // text/chat model (default 'gpt-5.1')
  azureChatDeployment?: string      // Azure chat deployment (no default)
}

/** @deprecated Use AiServiceSettings. Kept as alias during migration. */
export type TranscriptionSettings = AiServiceSettings
/** @deprecated Use AiServiceProvider. */
export type TranscriptionProvider = AiServiceProvider

/** The prompt sent to the agent when the user hasn't edited it. Shared by the
 *  host (fallback when the run request carries no prompt) and the webview
 *  (pre-fills the visible, editable prompt box). */
export const DEFAULT_WATCH_QUESTION =
  'Summarize the video in three short bullets: **Thesis** (the core claim), **Support** (the main evidence used), **Title** (if the title poses a question, was it answered? — say so if it doesn\'t). Cite frame numbers or transcript moments when useful. ≤300 words total.'

export interface WatchSetupStatus {
  ffmpeg: boolean
  ytdlp: boolean
  hasBrew: boolean
  provider: TranscriptionProvider
  hasApiKey: boolean
}

export interface WatchFrameRef {
  path: string
  timestampSeconds: number
  hdPath?: string
}

export interface WatchPeekResult {
  ok: boolean
  title?: string
  uploader?: string
  durationSeconds?: number
  thumbnailDataUrl?: string
  webpageUrl?: string
  error?: string
}

/** Metadata for the single previewed video (peek result, preview cache, player). */
export interface WatchVideoInfo {
  url: string
  title?: string
  uploader?: string
  durationSeconds?: number
  thumbnailDataUrl?: string
}

export type WatchRunStatus = 'processing' | 'ready' | 'error'

/** Persisted state of a session's (single-video) watch run. */
export interface WatchRunState {
  runId: string
  status: WatchRunStatus
  frames: WatchFrameRef[]
  workDir?: string
  error?: string
  question?: string
}

export interface WatchVideoRunResult {
  ok: boolean
  error?: string
  workDir?: string
}

export interface WatchSessionSnapshot {
  url: string
  run: WatchRunState | null
}
