export type ChatRole = 'user' | 'agent' | 'system'

export interface ChatMessage {
  id: string
  sessionId: string
  role: ChatRole
  text: string
  timestamp: number
}

export type AppStatus = 'idle' | 'scaffolding' | 'building' | 'previewing' | 'deploying' | 'live' | 'error'

export interface SimpleApp {
  sessionId: string
  projectId: string
  branchName: string
  name: string
  description: string
  status: AppStatus
  previewUrl: string | null
  liveUrl: string | null
  projectPath: string
  createdAt: number
  updatedAt: number
}

export interface DeploymentStatus {
  sessionId: string
  stage: AppStatus
  message: string
  url?: string
}

// Re-export for backwards compatibility — prefer importing from simple-prompts directly.
export { buildSimplePrompt } from './simple-prompts'
