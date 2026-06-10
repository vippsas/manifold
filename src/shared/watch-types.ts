import type { AiServiceProvider, AiServiceSettings } from './plugins/api-types'

export type { AiServiceProvider, AiServiceSettings } from './plugins/api-types'

/** @deprecated Use AiServiceSettings. Kept as alias during migration. */
export type TranscriptionSettings = AiServiceSettings
/** @deprecated Use AiServiceProvider. */
export type TranscriptionProvider = AiServiceProvider

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

export interface WatchPlaylistEntry {
  url: string
  title?: string
  uploader?: string
  durationSeconds?: number
  thumbnailDataUrl?: string
}

export interface WatchPlaylistPeekResult {
  ok: boolean
  playlistTitle?: string
  uploader?: string
  entries: WatchPlaylistEntry[]
  error?: string
}

export interface WatchPlaylistEntryInput {
  url: string
  question?: string
  title?: string
  /** Caller-supplied original index. Used so per-entry events
   *  (frames, sessionId) round-trip with the index the renderer renders by. */
  originalIndex?: number
}

export interface WatchPlaylistRunResult {
  ok: boolean
  error?: string
  spawnedSessionIds?: string[]
  aggregateDir?: string
  entryResults?: Array<{
    url: string
    ok: boolean
    error?: string
    workDir?: string
    sessionId?: string
  }>
}

export interface WatchRunResult {
  ok: boolean
  error?: string
  workDir?: string
  reportPath?: string
  frameCount?: number
  frames?: WatchFrameRef[]
  transcriptSource?: 'captions' | 'openai' | 'azure' | 'none'
}

export type WatchRunEntryStatus = 'queued' | 'processing' | 'ready' | 'error'

export interface WatchRunEntryState {
  originalIndex: number
  url: string
  title?: string
  question?: string
  siblingSessionId?: string
  workDir?: string
  frames: WatchFrameRef[]
  status: WatchRunEntryStatus
  error?: string
}

export interface WatchSessionSnapshot {
  url: string
  playlistFrames: Record<number, WatchFrameRef[]>
  siblingByIndex: Record<number, string>
  playlistDispatched: boolean
  runId?: string
  entries?: WatchRunEntryState[]
}
