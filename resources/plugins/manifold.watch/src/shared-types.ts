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
  'Give a detailed summary of the video. Open with a one-paragraph overview (what it is, who made it, and its core thesis or purpose), then walk through the content in the order it unfolds — each major section or argument as its own short paragraph or bullet, capturing the key points, evidence, examples, and any data, demos, or visuals shown. Note important shifts, counterpoints, or conclusions, and end with the main takeaways. Ground specific claims in the source by citing frame numbers and transcript timestamps (t=MM:SS) where useful. Use clear headings or bullets so it is easy to scan; be thorough rather than terse, but do not invent anything that is not in the frames or transcript.'

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
