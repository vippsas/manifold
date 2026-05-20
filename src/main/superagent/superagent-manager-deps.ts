import type { AgentSession, AgentStatus } from '../../shared/types'
import type { ApprovalBroker } from './approval-broker'
import type { McpBridgeServer } from './mcp-bridge-server'
import type { SuperagentStore } from './superagent-store'
import type { FleetWorktreeManager } from './superagent-fleet'

export interface SuperagentManagerDeps {
  store: SuperagentStore
  storageRoot: string
  approvalBroker: ApprovalBroker
  worktreeManager: FleetWorktreeManager
  projectRegistry: {
    getProject: (id: string) => any
    listProjects: () => any[]
  }
  sessionManager: {
    getSession: (id: string) => any
    createSession: (opts: any) => Promise<any>
    setParentSuperagent: (sessionId: string, parentSuperagentId?: string) => AgentSession
    killSession: (id: string) => Promise<void>
    getOutputBuffer: (id: string) => string
    sendInput: (id: string, data: string) => void
  }
  diffProvider: { getDiff: (path: string, base: string) => Promise<string> }
  ptyPool: {
    spawn: (file: string, args: string[], opts: { cwd: string; env?: Record<string, string>; cols?: number; rows?: number }) => { id: string; pid: number }
    kill: (ptyId: string) => void
    onData: (ptyId: string, fn: (data: string) => void) => void
    onExit: (ptyId: string, fn: () => void) => void
    write: (ptyId: string, data: string) => void
    resize?: (ptyId: string, cols: number, rows: number) => void
  }
  runtimes: { getRuntimeById: (id: string) => { id: string; binary: string; args?: string[] } | undefined }
  mcpBridge: McpBridgeServer
  emitStatus: (superagentId: string, status: AgentStatus) => void
  emitListChanged: () => void
  emitChildSpawned: (superagentId: string, sessionId: string) => void
  emitOutput: (superagentId: string, chunk: string) => void
}
