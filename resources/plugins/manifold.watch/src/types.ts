export interface VideoMetadata {
  durationSeconds: number
  width?: number
  height?: number
  codec?: string
  hasAudio: boolean
}

export interface DownloadResult {
  videoPath: string
  subtitlePath: string | null
  info: { title?: string; uploader?: string; url?: string }
  downloaded: boolean
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

export type TranscriptSource = 'captions' | 'azure' | 'openai' | 'none'

export interface TranscriptResult {
  segments: TranscriptSegment[]
  source: TranscriptSource
}

export interface FrameInfo {
  index: number
  timestampSeconds: number
  path: string
  hdPath?: string
}

export interface FrameExtractionResult {
  frames: FrameInfo[]
  fps: number
  target: number
  focused: boolean
}

export interface PipelineOptions {
  source: string
  workDir?: string
  startSeconds?: number
  endSeconds?: number
  maxFrames?: number
  resolutionPx?: number
  hdResolutionPx?: number
  fpsOverride?: number
}

export interface PipelineResult {
  workDir: string
  reportPath: string
  framesDir: string
  frames: FrameInfo[]
  metadata: VideoMetadata
  transcript: TranscriptResult
  fps: number
  focused: boolean
  effectiveStart: number
  effectiveEnd: number
}
