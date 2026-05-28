import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { AgentRuntime } from '../../shared/types'
import type { Superagent, SuperagentCreateOptions, SuperagentProjectAddition } from '../../shared/superagent-types'
import type { AgentStatus } from '../../shared/types'
import { sortProjectsByName } from '../../shared/project-sort'
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
import { getOrchestratorLauncher } from './runtime-launchers'
import { addProjectToFleet, computeFleetStatus, spawnFleetAgent } from './superagent-fleet-ops'

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

  appendSystemOutput(superagentId: string, data: string): void {
    const prev = this.outputBuffers.get(superagentId) ?? ''
    const next = prev + data
    this.outputBuffers.set(superagentId, next.length > MAX_OUTPUT_BUFFER ? next.slice(-MAX_OUTPUT_BUFFER) : next)
    this.deps.emitOutput(superagentId, data)
  }

  async create(options: SuperagentCreateOptions): Promise<Superagent> {
    if (options.fleetProjectIds.length === 0) {
      throw new Error('Fleet must contain at least one project')
    }
    const id = randomUUID()
    const { coordinationPath, bridgeScriptPath } = setupCoordinationDir(this.deps.storageRoot, id)

    const runtime = this.deps.runtimes.getRuntimeById(options.runtimeId)
    if (!runtime) throw new Error(`Runtime not available: ${options.runtimeId}`)
    if (!runtime.orchestratorCapable) {
      throw new Error(`Runtime "${runtime.name}" does not support superagent orchestration`)
    }

    const fleet = sortProjectsByName(options.fleetProjectIds.map((projectId) => {
      const project = this.deps.projectRegistry.getProject(projectId)
      if (!project) throw new Error(`Project not found: ${projectId}`)
      return project
    }))

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
    const persistentContext = buildOrchestratorPrompt({
      taskDescription: options.taskDescription,
      initialPrompt: '',
      fleet,
      fleetWorktreePaths,
      branchName,
    })

    const superagent: Superagent = {
      id,
      name: options.name,
      taskDescription: options.taskDescription,
      runtimeId: options.runtimeId,
      fleetProjectIds: fleet.map((project) => project.id),
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

    await this.spawnAndWire(id, coordinationPath, runtime, bridgeScriptPath, prompt, persistentContext)

    this.deps.emitListChanged()

    return this.deps.store.get(id) ?? superagent
  }

  addProjectToFleet(superagentId: string, addition: SuperagentProjectAddition): Promise<Superagent> {
    return addProjectToFleet(this.deps, superagentId, addition)
  }

  async resume(superagentId: string): Promise<void> {
    const superagent = this.deps.store.get(superagentId)
    if (!superagent) throw new Error(`Superagent not found: ${superagentId}`)
    if (this.active.has(superagentId)) return

    const runtime = this.deps.runtimes.getRuntimeById(superagent.runtimeId)
    if (!runtime) throw new Error(`Runtime not available: ${superagent.runtimeId}`)

    const bridgeScriptPath = path.join(superagent.coordinationPath, 'mcp-bridge.js')
    if (!fs.existsSync(bridgeScriptPath)) {
      throw new Error(`Coordination directory missing MCP bridge script: ${bridgeScriptPath}`)
    }

    this.outputBuffers.delete(superagentId)
    const resumeFleet = superagent.fleetProjectIds
      .map((pid) => this.deps.projectRegistry.getProject(pid))
      .filter(Boolean)
    const resumeContext = buildOrchestratorPrompt({
      taskDescription: superagent.taskDescription,
      initialPrompt: '',
      fleet: resumeFleet,
      fleetWorktreePaths: superagent.fleetWorktreePaths,
      branchName: superagent.branchName,
    })
    await this.spawnAndWire(superagentId, superagent.coordinationPath, runtime, bridgeScriptPath, undefined, resumeContext)
    this.deps.emitListChanged()
  }

  private async spawnAndWire(
    id: string,
    coordinationPath: string,
    runtime: AgentRuntime,
    bridgeScriptPath: string,
    initialPrompt: string | undefined,
    persistentContext: string,
  ): Promise<void> {
    const launcher = getOrchestratorLauncher(runtime.id)
    if (!launcher) {
      throw new Error(`No orchestrator launcher registered for runtime "${runtime.id}"`)
    }

    const spec = await launcher.prepare({
      superagentId: id,
      coordinationPath,
      bridgeScriptPath,
      mcpSocketPath: this.deps.mcpBridge.socketPath,
      runtimeBinary: runtime.binary,
      runtimeArgs: runtime.args ?? [],
      initialPrompt,
      persistentContext,
    })

    const handle = this.deps.ptyPool.spawn(spec.binary, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
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

  spawnFleetAgent(superagentId: string, projectId: string): Promise<{ id: string }> {
    return spawnFleetAgent(this.deps, superagentId, projectId)
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
    computeFleetStatus(this.deps, superagentId)
  }
}
