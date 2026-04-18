import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Superagent, SuperagentCreateOptions } from '../../shared/superagent-types'
import type { AgentStatus } from '../../shared/types'
import { OrchestratorMcpServer } from './orchestrator-mcp-server'
import { buildOrchestratorPrompt } from './orchestrator-prompt'
import { setupCoordinationDir, slugifyName } from './superagent-coordination'
import {
  collectActiveChildWorktrees,
  createFleetWorktrees,
  findAvailableFleetBranch,
  killDormantChildren,
  removeFleetWorktreesExcept,
} from './superagent-fleet'
import type { SuperagentManagerDeps } from './superagent-manager-deps'

export type { SuperagentManagerDeps } from './superagent-manager-deps'

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
    const { coordinationPath, mcpConfigPath } = setupCoordinationDir(this.deps.storageRoot, id)

    const runtime = this.deps.runtimes.getRuntimeById(options.runtimeId)
    if (!runtime) throw new Error(`Runtime not available: ${options.runtimeId}`)
    if (!runtime.orchestratorCapable) {
      throw new Error(`Runtime "${runtime.name}" does not support superagent orchestration`)
    }

    const fleet = options.fleetProjectIds
      .map((pid) => this.deps.projectRegistry.getProject(pid))
      .filter(Boolean)

    const desiredBranch = `manifold/${slugifyName(options.name)}`
    const branchName = await findAvailableFleetBranch(this.deps.worktreeManager, fleet, desiredBranch)
    const fleetWorktreePaths = await createFleetWorktrees(this.deps.worktreeManager, fleet, branchName)

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
      runtimeId: options.runtimeId,
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
    const superagent = this.deps.store.get(superagentId)

    const entry = this.active.get(superagentId)
    if (entry) {
      this.deps.ptyPool.kill(entry.ptyId)
      this.active.delete(superagentId)
    }
    this.outputBuffers.delete(superagentId)

    if (superagent) {
      const getSession = (id: string) => this.deps.sessionManager.getSession(id)
      // Dormant children have no orchestrator once the superagent is gone;
      // worktrees holding an active child are preserved so the live agent keeps running.
      await killDormantChildren(superagent.childSessionIds, getSession, (id) => this.deps.sessionManager.killSession(id))
      const inUse = collectActiveChildWorktrees(superagent.childSessionIds, getSession)
      await removeFleetWorktreesExcept(
        this.deps.worktreeManager,
        superagent.fleetWorktreePaths ?? {},
        (pid) => this.deps.projectRegistry.getProject(pid)?.path,
        inUse,
      )
    }

    this.deps.store.remove(superagentId)
    this.deps.emitListChanged()
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
