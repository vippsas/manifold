export type TranscriptionProvider = 'openai' | 'azure' | 'none'

export interface TranscriptionSettings {
  provider: TranscriptionProvider
  openaiApiKey?: string
  azureApiKey?: string
  azureEndpoint?: string
  azureDeployment?: string
}

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

export interface WatchRunResult {
  ok: boolean
  error?: string
  workDir?: string
  reportPath?: string
  frameCount?: number
  frames?: WatchFrameRef[]
  transcriptSource?: 'captions' | 'openai' | 'azure' | 'none'
}
