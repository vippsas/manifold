import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Superagent, SuperagentCreateOptions } from '../../shared/superagent-types'
import type { AgentStatus } from '../../shared/types'
import { OrchestratorMcpServer } from './orchestrator-mcp-server'
import { buildOrchestratorPrompt } from './orchestrator-prompt'
import type { SuperagentStore } from './superagent-store'
import type { ApprovalBroker } from './approval-broker'
import type { McpBridgeServer } from './mcp-bridge-server'
import { MCP_BRIDGE_SCRIPT, TOOL_SCHEMAS } from './mcp-bridge-script'

export interface SuperagentManagerDeps {
  store: SuperagentStore
  storageRoot: string
  approvalBroker: ApprovalBroker
  worktreeManager: {
    createWorktree: (projectPath: string, baseBranch: string, projectName: string, branchName?: string) => Promise<{ branch: string; path: string }>
    removeWorktree: (projectPath: string, worktreePath: string) => Promise<void>
  }
  projectRegistry: {
    getProject: (id: string) => any
    listProjects: () => any[]
  }
  sessionManager: {
    getSession: (id: string) => any
    createSession: (opts: any) => Promise<any>
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

const MAX_OUTPUT_BUFFER = 1_000_000

export class SuperagentManager {
  private readonly active = new Map<string, { ptyId: string; mcp: OrchestratorMcpServer }>()
  private readonly outputBuffers = new Map<string, string>()

  constructor(private readonly deps: SuperagentManagerDeps) {}

  list(): Superagent[] {
    return this.deps.store.list()
  }

  isSuperagent(id: string): boolean {
    return this.deps.store.get(id) !== undefined
  }

  sendInput(superagentId: string, data: string): void {
    const entry = this.active.get(superagentId)
    if (!entry) return
    this.deps.ptyPool.write(entry.ptyId, data)
  }

  resize(superagentId: string, cols: number, rows: number): void {
    const entry = this.active.get(superagentId)
    if (!entry) return
    this.deps.ptyPool.resize?.(entry.ptyId, cols, rows)
  }

  interrupt(superagentId: string): void {
    const entry = this.active.get(superagentId)
    if (!entry) return
    this.deps.ptyPool.write(entry.ptyId, '\x03')
  }

  getOutputBuffer(superagentId: string): string {
    return this.outputBuffers.get(superagentId) ?? ''
  }

  async create(options: SuperagentCreateOptions): Promise<Superagent> {
    if (options.fleetProjectIds.length === 0) {
      throw new Error('Fleet must contain at least one project')
    }
    const id = randomUUID()
    const coordinationPath = path.join(this.deps.storageRoot, 'superagents', id)
    fs.mkdirSync(coordinationPath, { recursive: true })
    fs.writeFileSync(
      path.join(coordinationPath, 'plan.md'),
      '# Plan\n\n_Orchestrator may edit freely._\n',
    )

    const bridgeScriptPath = path.join(coordinationPath, 'mcp-bridge.js')
    const toolSchemasPath = path.join(coordinationPath, 'tool-schemas.json')
    const mcpConfigPath = path.join(coordinationPath, 'mcp-config.json')
    fs.writeFileSync(bridgeScriptPath, MCP_BRIDGE_SCRIPT)
    fs.writeFileSync(toolSchemasPath, JSON.stringify(TOOL_SCHEMAS, null, 2))
    fs.writeFileSync(
      mcpConfigPath,
      JSON.stringify(
        { mcpServers: { 'manifold-orchestrator': { command: 'node', args: [bridgeScriptPath] } } },
        null,
        2,
      ),
    )

    const runtime = this.deps.runtimes.getRuntimeById('claude')
    if (!runtime) throw new Error('Claude runtime not available')

    const fleet = options.fleetProjectIds
      .map((pid) => this.deps.projectRegistry.getProject(pid))
      .filter(Boolean)

    const branchName = `manifold/${slugifyName(options.name)}`
    const fleetWorktreePaths = await this.createFleetWorktrees(fleet, branchName)

    const prompt = buildOrchestratorPrompt({
      taskDescription: options.taskDescription,
      initialPrompt: options.initialPrompt,
      fleet,
      fleetWorktreePaths,
      branchName,
    })

    const superagent: Superagent = {
      id,
      name: options.name,
      taskDescription: options.taskDescription,
      runtimeId: 'claude',
      fleetProjectIds: [...options.fleetProjectIds],
      fleetWorktreePaths,
      branchName,
      childSessionIds: [],
      coordinationPath,
      createdAt: new Date().toISOString(),
      pid: null,
      status: 'running',
      autoApprove: false,
    }
    this.deps.store.add(superagent)

    this.spawnAndWire(id, coordinationPath, runtime, mcpConfigPath, prompt)

    this.deps.emitListChanged()

    return this.deps.store.get(id) ?? superagent
  }

  private async createFleetWorktrees(
    fleet: { id: string; path: string; name: string; baseBranch: string }[],
    branchName: string,
  ): Promise<Record<string, string>> {
    const created: { projectPath: string; worktreePath: string }[] = []
    const result: Record<string, string> = {}
    try {
      for (const project of fleet) {
        const info = await this.deps.worktreeManager.createWorktree(
          project.path,
          project.baseBranch,
          project.name,
          branchName,
        )
        created.push({ projectPath: project.path, worktreePath: info.path })
        result[project.id] = info.path
      }
      return result
    } catch (err) {
      // Best-effort rollback to avoid leaking worktrees on partial failure.
      for (const { projectPath, worktreePath } of created) {
        try { await this.deps.worktreeManager.removeWorktree(projectPath, worktreePath) } catch { /* ignore */ }
      }
      throw err
    }
  }

  async resume(superagentId: string): Promise<void> {
    const superagent = this.deps.store.get(superagentId)
    if (!superagent) throw new Error(`Superagent not found: ${superagentId}`)
    if (this.active.has(superagentId)) return

    const runtime = this.deps.runtimes.getRuntimeById(superagent.runtimeId)
    if (!runtime) throw new Error(`Runtime not available: ${superagent.runtimeId}`)

    const mcpConfigPath = path.join(superagent.coordinationPath, 'mcp-config.json')
    if (!fs.existsSync(mcpConfigPath)) {
      throw new Error(`Coordination directory missing MCP config: ${mcpConfigPath}`)
    }

    this.outputBuffers.delete(superagentId)
    this.spawnAndWire(superagentId, superagent.coordinationPath, runtime, mcpConfigPath, undefined)
    this.deps.emitListChanged()
  }

  private spawnAndWire(
    id: string,
    coordinationPath: string,
    runtime: { binary: string; args?: string[] },
    mcpConfigPath: string,
    initialPrompt: string | undefined,
  ): void {
    const args = [
      ...(runtime.args ?? []),
      '--mcp-config', mcpConfigPath,
      '--strict-mcp-config',
    ]
    if (initialPrompt !== undefined) args.push(initialPrompt)

    const handle = this.deps.ptyPool.spawn(runtime.binary, args, {
      cwd: coordinationPath,
      env: {
        MANIFOLD_SUPERAGENT_ID: id,
        MANIFOLD_MCP_SOCKET: this.deps.mcpBridge.socketPath,
      },
    })

    const mcp = new OrchestratorMcpServer({
      superagentId: id,
      getSuperagent: () => this.deps.store.get(id),
      projectRegistry: this.deps.projectRegistry,
      sessionManager: this.deps.sessionManager,
      diffProvider: this.deps.diffProvider,
      approvalBroker: this.deps.approvalBroker,
      getAutoApprove: () => this.deps.store.get(id)?.autoApprove ?? false,
      onChildSpawned: (sessionId) => {
        this.deps.store.addChild(id, sessionId)
        this.deps.emitChildSpawned(id, sessionId)
      },
    })

    this.deps.ptyPool.onData(handle.id, (data) => {
      const prev = this.outputBuffers.get(id) ?? ''
      const next = prev + data
      this.outputBuffers.set(id, next.length > MAX_OUTPUT_BUFFER ? next.slice(-MAX_OUTPUT_BUFFER) : next)
      this.deps.emitOutput(id, data)
    })
    this.deps.ptyPool.onExit(handle.id, () => {
      this.deps.store.update(id, { status: 'done', pid: null })
      this.deps.emitStatus(id, 'done')
      this.deps.emitListChanged()
      this.active.delete(id)
    })
    this.active.set(id, { ptyId: handle.id, mcp })

    this.deps.store.update(id, { status: 'running', pid: handle.pid })
    this.deps.emitStatus(id, 'running')
  }

  async kill(superagentId: string): Promise<void> {
    const entry = this.active.get(superagentId)
    if (entry) {
      this.deps.ptyPool.kill(entry.ptyId)
      this.active.delete(superagentId)
    }
    this.outputBuffers.delete(superagentId)
    this.deps.store.update(superagentId, { status: 'done', pid: null })
    this.deps.emitStatus(superagentId, 'done')
    this.deps.emitListChanged()
  }

  async remove(superagentId: string): Promise<void> {
    const entry = this.active.get(superagentId)
    if (entry) {
      this.deps.ptyPool.kill(entry.ptyId)
      this.active.delete(superagentId)
    }
    this.outputBuffers.delete(superagentId)
    await this.removeFleetWorktrees(superagentId)
    this.deps.store.remove(superagentId)
    this.deps.emitListChanged()
  }

  private async removeFleetWorktrees(superagentId: string): Promise<void> {
    const superagent = this.deps.store.get(superagentId)
    if (!superagent) return
    for (const [projectId, worktreePath] of Object.entries(superagent.fleetWorktreePaths ?? {})) {
      const project = this.deps.projectRegistry.getProject(projectId)
      if (!project?.path) continue
      try {
        await this.deps.worktreeManager.removeWorktree(project.path, worktreePath)
      } catch {
        // Best-effort: worktree may already be gone.
      }
    }
  }

  async spawnFleetAgent(superagentId: string, projectId: string): Promise<{ id: string }> {
    const superagent = this.deps.store.get(superagentId)
    if (!superagent) throw new Error(`Superagent not found: ${superagentId}`)
    if (!superagent.fleetProjectIds.includes(projectId)) {
      throw new Error(`Project ${projectId} is not in fleet of superagent ${superagentId}`)
    }
    const worktreePath = superagent.fleetWorktreePaths?.[projectId]
    if (!worktreePath) throw new Error(`No fleet worktree for project ${projectId}`)

    const existing = superagent.childSessionIds
      .map((sid) => this.deps.sessionManager.getSession(sid))
      .find((s) => s && s.projectId === projectId && s.worktreePath === worktreePath)
    if (existing) return { id: existing.id }

    const session = await this.deps.sessionManager.createSession({
      projectId,
      runtimeId: superagent.runtimeId,
      prompt: '',
      existingWorktreePath: worktreePath,
      parentSuperagentId: superagentId,
    })

    this.deps.store.addChild(superagentId, session.id)
    this.deps.emitChildSpawned(superagentId, session.id)
    this.deps.emitListChanged()
    return { id: session.id }
  }

  setAutoApprove(superagentId: string, value: boolean): void {
    this.deps.store.update(superagentId, { autoApprove: value })
  }

  handleToolCall(superagentId: string, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const entry = this.active.get(superagentId)
    if (!entry) throw new Error(`Superagent ${superagentId} not active`)
    return entry.mcp.handleToolCall(name, args)
  }

  onChildStatusChange(superagentId: string, _childId: string, _childStatus: AgentStatus): void {
    const s = this.deps.store.get(superagentId)
    if (!s) return
    const childStatuses = s.childSessionIds
      .map((id) => this.deps.sessionManager.getSession(id)?.status)
      .filter((v: AgentStatus | undefined): v is AgentStatus => Boolean(v))

    let status: AgentStatus = 'waiting'
    if (childStatuses.some((st: AgentStatus) => st === 'error')) status = 'error'
    else if (childStatuses.some((st: AgentStatus) => st === 'running')) status = 'running'
    else if (childStatuses.length > 0 && childStatuses.every((st: AgentStatus) => st === 'done')) status = 'done'
    else status = 'waiting'

    this.deps.store.update(superagentId, { status })
    this.deps.emitStatus(superagentId, status)
  }
}

function slugifyName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
  return slug || 'superagent'
}
