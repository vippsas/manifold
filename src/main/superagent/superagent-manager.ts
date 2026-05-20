import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { AgentRuntime } from '../../shared/types'
import type { Superagent, SuperagentCreateOptions, SuperagentProjectAddition } from '../../shared/superagent-types'
import type { AgentStatus } from '../../shared/types'
import { isGitProject } from '../../shared/project-kind'
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
import { debugLog } from '../app/debug-log'

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

  async addProjectToFleet(superagentId: string, addition: SuperagentProjectAddition): Promise<Superagent> {
    const { projectId, reuseSessionId } = addition
    const superagent = this.deps.store.get(superagentId)
    if (!superagent) throw new Error(`Superagent not found: ${superagentId}`)
    if (superagent.fleetProjectIds.includes(projectId)) {
      const adopted = this.adoptExistingSession(superagentId, superagent, projectId, reuseSessionId)
      this.deps.emitListChanged()
      return adopted
    }

    const project = this.deps.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)

    const worktreeInfo = isGitProject(project)
      ? await (async () => {
          const branchExists = await this.deps.worktreeManager.branchExists(project.path, superagent.branchName)
          return branchExists && this.deps.worktreeManager.createWorktreeFromBranch
            ? this.deps.worktreeManager.createWorktreeFromBranch(
                project.path,
                project.name,
                superagent.branchName,
                project.baseBranch,
              )
            : this.deps.worktreeManager.createWorktree(
                project.path,
                project.baseBranch,
                project.name,
                superagent.branchName,
              )
        })()
      : { branch: superagent.branchName, path: project.path }

    const nextFleet = sortProjectsByName([
      ...superagent.fleetProjectIds
        .map((id) => this.deps.projectRegistry.getProject(id))
        .filter((entry): entry is typeof project => Boolean(entry)),
      project,
    ])

    const updated = this.deps.store.update(superagentId, {
      fleetProjectIds: nextFleet.map((entry) => entry.id),
      fleetWorktreePaths: {
        ...(superagent.fleetWorktreePaths ?? {}),
        [projectId]: worktreeInfo.path,
      },
    })
    if (!updated) throw new Error(`Superagent not found: ${superagentId}`)

    const adopted = this.adoptExistingSession(superagentId, updated, projectId, reuseSessionId)
    this.persistFleetContext(adopted)
    this.deps.emitListChanged()
    return adopted
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

  private persistFleetContext(superagent: Superagent): void {
    const fleet = sortProjectsByName(
      superagent.fleetProjectIds
        .map((projectId) => this.deps.projectRegistry.getProject(projectId))
        .filter(Boolean),
    )
    const persistentContext = buildOrchestratorPrompt({
      taskDescription: superagent.taskDescription,
      initialPrompt: '',
      fleet,
      fleetWorktreePaths: superagent.fleetWorktreePaths,
      branchName: superagent.branchName,
    })
    try {
      fs.writeFileSync(path.join(superagent.coordinationPath, 'AGENTS.md'), persistentContext + '\n')
    } catch (err) {
      // Best-effort write — the next resume rewrites AGENTS.md. Log so a
      // persistent failure (permissions, ENOSPC) is diagnosable when the
      // orchestrator appears to be running with stale fleet context.
      debugLog(`[superagent] persistFleetContext write failed for ${superagent.id}: ${(err as Error)?.message}`)
    }
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

    let targetWorktreePath = worktreePath
    const project = this.deps.projectRegistry.getProject(projectId)
    if (!project) throw new Error(`Project not found: ${projectId}`)

    if (isGitProject(project) && !fs.existsSync(targetWorktreePath)) {

      let restored: { path: string } | null = null
      if (this.deps.worktreeManager.createWorktreeFromBranch) {
        restored = await this.deps.worktreeManager.createWorktreeFromBranch(
          project.path,
          project.name,
          superagent.branchName,
          project.baseBranch,
        )
      } else if (!(await this.deps.worktreeManager.branchExists(project.path, superagent.branchName))) {
        restored = await this.deps.worktreeManager.createWorktree(
          project.path,
          project.baseBranch,
          project.name,
          superagent.branchName,
        )
      } else {
        throw new Error(`Fleet worktree for project ${projectId} is missing and cannot be restored`)
      }

      targetWorktreePath = restored.path
      if (targetWorktreePath !== worktreePath) {
        this.deps.store.update(superagentId, {
          fleetWorktreePaths: {
            ...(superagent.fleetWorktreePaths ?? {}),
            [projectId]: targetWorktreePath,
          },
        })
        this.deps.emitListChanged()
      }
    }

    const session = await this.deps.sessionManager.createSession({
      projectId,
      runtimeId: superagent.runtimeId,
      prompt: '',
      ...(isGitProject(project)
        ? { existingWorktreePath: targetWorktreePath }
        : { noWorktree: true }),
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

  private adoptExistingSession(
    superagentId: string,
    superagent: Superagent,
    projectId: string,
    reuseSessionId?: string,
  ): Superagent {
    if (!reuseSessionId) return superagent

    const session = this.deps.sessionManager.getSession(reuseSessionId)
    if (!session) throw new Error(`Session not found: ${reuseSessionId}`)
    if (session.projectId !== projectId) {
      throw new Error(`Session ${reuseSessionId} does not belong to project ${projectId}`)
    }
    if (session.noWorktree) {
      throw new Error('No-worktree sessions cannot be reused in a superagent fleet')
    }
    if (session.parentSuperagentId && session.parentSuperagentId !== superagentId) {
      throw new Error(`Session ${reuseSessionId} already belongs to another superagent`)
    }

    const fleetWorktreePath = superagent.fleetWorktreePaths?.[projectId]
    if (!fleetWorktreePath) {
      throw new Error(`No fleet worktree for project ${projectId}`)
    }
    if (session.worktreePath !== fleetWorktreePath) {
      throw new Error(
        `Session ${reuseSessionId} is not on the superagent worktree for project ${projectId}`,
      )
    }

    this.deps.sessionManager.setParentSuperagent(reuseSessionId, superagentId)
    this.deps.store.addChild(superagentId, reuseSessionId)
    return this.deps.store.get(superagentId) ?? superagent
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
