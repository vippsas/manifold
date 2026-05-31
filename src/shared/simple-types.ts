export type ChatRole = 'user' | 'agent' | 'system'

export interface ChatMessage {
  id: string
  sessionId: string
  role: ChatRole
  text: string
  timestamp: number
  options?: string[]
}

export type AppStatus = 'idle' | 'scaffolding' | 'building' | 'previewing' | 'live' | 'error'

export interface SimpleApp {
  sessionId: string
  projectId: string
  runtimeId?: string
  branchName: string
  name: string
  description: string
  simpleTemplateTitle?: string
  simplePromptInstructions?: string
  status: AppStatus
  previewUrl: string | null
  liveUrl: string | null
  projectPath: string
  createdAt: number
  updatedAt: number
}

// Re-export for backwards compatibility — prefer importing from simple-prompts directly.
export { buildSimplePrompt } from './simple-prompts'
