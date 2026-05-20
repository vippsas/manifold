import type { AgentStatus } from './types'

export interface Superagent {
  id: string
  name: string
  taskDescription: string
  runtimeId: string
  fleetProjectIds: string[]
  fleetWorktreePaths: Record<string, string>
  branchName: string
  childSessionIds: string[]
  coordinationPath: string
  createdAt: string
  pid: number | null
  status: AgentStatus
  autoApprove: boolean
}

export interface SuperagentCreateOptions {
  name: string
  taskDescription: string
  runtimeId: string
  fleetProjectIds: string[]
  initialPrompt: string
}

export interface SuperagentProjectAddition {
  projectId: string
  reuseSessionId?: string
}

export type ApprovalToolName =
  | 'spawn_agent'
  | 'send_prompt'
  | 'stop_agent'

export interface ApprovalRequest {
  requestId: string
  superagentId: string
  toolName: ApprovalToolName
  args: Record<string, unknown>
  requestedAt: number
}

export interface ApprovalResponse {
  requestId: string
  decision: 'approve' | 'deny' | 'approve-all'
}
