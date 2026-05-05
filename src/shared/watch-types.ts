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
  claudeCli: boolean
  apiKeyKind: 'openai' | 'azure' | null
}
