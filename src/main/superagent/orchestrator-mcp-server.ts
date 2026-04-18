import type { Superagent } from '../../shared/superagent-types'
import type { AgentSession, SpawnAgentOptions } from '../../shared/types'
import type { ApprovalBroker } from './approval-broker'

interface ProjectLike {
  id: string
  name: string
  path: string
  baseBranch?: string
}

export interface OrchestratorDeps {
  superagentId: string
  getSuperagent: () => Superagent | undefined
  projectRegistry: {
    getProject: (id: string) => ProjectLike | undefined
  }
  sessionManager: {
    getSession: (id: string) => AgentSession | undefined
    createSession: (opts: SpawnAgentOptions & { parentSuperagentId?: string }) => Promise<AgentSession>
    killSession: (id: string) => Promise<void>
    getOutputBuffer: (id: string) => string
    sendInput: (id: string, data: string) => void
  }
  diffProvider: {
    getDiff: (worktreePath: string, baseBranch: string) => Promise<string>
  }
  approvalBroker: ApprovalBroker
  getAutoApprove: () => boolean
  onChildSpawned?: (sessionId: string) => void
}

export type ToolResult = Record<string, unknown>

const READ_ONLY_TOOLS = new Set(['list_projects', 'read_status', 'read_output', 'read_diff'])
const GATED_TOOLS = new Set(['spawn_agent', 'send_prompt', 'stop_agent'])

export class OrchestratorMcpServer {
  constructor(private readonly deps: OrchestratorDeps) {}

  async handleToolCall(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (READ_ONLY_TOOLS.has(name)) return this.handleReadOnly(name, args)
    if (GATED_TOOLS.has(name)) return this.handleGated(name, args)
    throw new Error(`Unknown tool: ${name}`)
  }

  private async handleReadOnly(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (name) {
      case 'list_projects':
        return this.listProjects()
      case 'read_status':
        return this.readStatus(String(args.sessionId))
      case 'read_output':
        return this.readOutput(String(args.sessionId))
      case 'read_diff':
        return this.readDiff(String(args.sessionId))
      default:
        throw new Error(`Unknown read-only tool: ${name}`)
    }
  }

  private async handleGated(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    // Validate first so we don't ask for approval on invalid calls.
    if (name === 'spawn_agent') {
      const projectId = String(args.projectId)
      const superagent = this.deps.getSuperagent()
      if (!superagent) throw new Error('Superagent not found')
      if (!superagent.fleetProjectIds.includes(projectId)) {
        throw new Error(`Project ${projectId} is not in fleet`)
      }
    } else if (name === 'send_prompt' || name === 'stop_agent') {
      this.requireChildSession(String(args.sessionId))
    }

    if (!this.deps.getAutoApprove()) {
      const decision = await this.deps.approvalBroker.requestApproval(
        this.deps.superagentId,
        name as any,
        args,
      )
      if (decision === 'deny') {
        throw new Error(`Tool call denied by user: ${name}`)
      }
    }

    switch (name) {
      case 'spawn_agent':
        return this.spawnAgent(args)
      case 'send_prompt':
        return this.sendPrompt(args)
      case 'stop_agent':
        return this.stopAgent(args)
      default:
        throw new Error(`Unknown gated tool: ${name}`)
    }
  }

  private async spawnAgent(args: Record<string, unknown>): Promise<ToolResult> {
    const projectId = String(args.projectId)
    const runtime = String(args.runtime)
    const prompt = String(args.prompt)
    const branchName = args.branchName ? String(args.branchName) : undefined
    const session = await this.deps.sessionManager.createSession({
      projectId,
      runtimeId: runtime,
      prompt,
      branchName,
      parentSuperagentId: this.deps.superagentId,
    })
    this.deps.onChildSpawned?.(session.id)
    return { sessionId: session.id }
  }

  private async sendPrompt(args: Record<string, unknown>): Promise<ToolResult> {
    const sessionId = String(args.sessionId)
    const prompt = String(args.prompt)
    this.deps.sessionManager.sendInput(sessionId, `${prompt}\r`)
    return { ok: true }
  }

  private async stopAgent(args: Record<string, unknown>): Promise<ToolResult> {
    const sessionId = String(args.sessionId)
    await this.deps.sessionManager.killSession(sessionId)
    return { ok: true }
  }

  private listProjects(): ToolResult {
    const superagent = this.deps.getSuperagent()
    if (!superagent) throw new Error('Superagent not found')
    const projects = superagent.fleetProjectIds
      .map((id) => this.deps.projectRegistry.getProject(id))
      .filter((p): p is ProjectLike => Boolean(p))
      .map(({ id, name, path }) => ({ id, name, path }))
    return { projects }
  }

  private requireChildSession(sessionId: string): AgentSession {
    const session = this.deps.sessionManager.getSession(sessionId)
    if (!session) throw new Error(`Session ${sessionId} not found`)
    if (session.parentSuperagentId !== this.deps.superagentId) {
      throw new Error(`Session ${sessionId} is not a child of this superagent`)
    }
    return session
  }

  private readStatus(sessionId: string): ToolResult {
    const session = this.requireChildSession(sessionId)
    return { status: session.status, pid: session.pid }
  }

  private readOutput(sessionId: string): ToolResult {
    this.requireChildSession(sessionId)
    return { text: this.deps.sessionManager.getOutputBuffer(sessionId) }
  }

  private async readDiff(sessionId: string): Promise<ToolResult> {
    const session = this.requireChildSession(sessionId)
    const project = this.deps.projectRegistry.getProject(session.projectId)
    const baseBranch = project?.baseBranch ?? 'main'
    const diff = await this.deps.diffProvider.getDiff(session.worktreePath, baseBranch)
    return { diff }
  }
}
