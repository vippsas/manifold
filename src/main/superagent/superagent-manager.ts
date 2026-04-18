import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Superagent, SuperagentCreateOptions } from '../../shared/superagent-types'
import type { AgentStatus } from '../../shared/types'
import { OrchestratorMcpServer } from './orchestrator-mcp-server'
import { buildOrchestratorPrompt } from './orchestrator-prompt'
import type { SuperagentStore } from './superagent-store'
import type { ApprovalBroker } from './approval-broker'

export interface SuperagentManagerDeps {
  store: SuperagentStore
  storageRoot: string
  approvalBroker: ApprovalBroker
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
    onData: (ptyId: string, fn: (data: string) => void) => () => void
    onExit: (ptyId: string, fn: () => void) => () => void
    write: (ptyId: string, data: string) => void
  }
  runtimes: { getRuntimeById: (id: string) => { id: string; binary: string; args?: string[] } | undefined }
  emitStatus: (superagentId: string, status: AgentStatus) => void
}

export class SuperagentManager {
  private readonly active = new Map<string, { ptyId: string; mcp: OrchestratorMcpServer; unsubscribes: Array<() => void> }>()

  constructor(private readonly deps: SuperagentManagerDeps) {}

  list(): Superagent[] {
    return this.deps.store.list()
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

    const runtime = this.deps.runtimes.getRuntimeById('claude')
    if (!runtime) throw new Error('Claude runtime not available')

    const fleet = options.fleetProjectIds
      .map((pid) => this.deps.projectRegistry.getProject(pid))
      .filter(Boolean)

    const prompt = buildOrchestratorPrompt({
      taskDescription: options.taskDescription,
      initialPrompt: options.initialPrompt,
      fleet,
    })

    const handle = this.deps.ptyPool.spawn(runtime.binary, runtime.args ?? [], {
      cwd: coordinationPath,
      env: { MANIFOLD_SUPERAGENT_ID: id },
    })

    const superagent: Superagent = {
      id,
      name: options.name,
      taskDescription: options.taskDescription,
      runtimeId: 'claude',
      fleetProjectIds: [...options.fleetProjectIds],
      childSessionIds: [],
      coordinationPath,
      createdAt: new Date().toISOString(),
      pid: handle.pid,
      status: 'running',
      autoApprove: false,
    }
    this.deps.store.add(superagent)

    const mcp = new OrchestratorMcpServer({
      superagentId: id,
      getSuperagent: () => this.deps.store.get(id),
      projectRegistry: this.deps.projectRegistry,
      sessionManager: this.deps.sessionManager,
      diffProvider: this.deps.diffProvider,
      approvalBroker: this.deps.approvalBroker,
      getAutoApprove: () => this.deps.store.get(id)?.autoApprove ?? false,
    })

    const unsubData = this.deps.ptyPool.onData(handle.id, () => undefined)
    const unsubExit = this.deps.ptyPool.onExit(handle.id, () => {
      this.deps.store.update(id, { status: 'done', pid: null })
      this.deps.emitStatus(id, 'done')
      this.active.delete(id)
    })
    this.active.set(id, { ptyId: handle.id, mcp, unsubscribes: [unsubData, unsubExit] })

    this.deps.ptyPool.write(handle.id, `${prompt}\r`)

    return superagent
  }

  async kill(superagentId: string): Promise<void> {
    const entry = this.active.get(superagentId)
    if (entry) {
      entry.unsubscribes.forEach((u) => u())
      this.deps.ptyPool.kill(entry.ptyId)
      this.active.delete(superagentId)
    }
    this.deps.store.update(superagentId, { status: 'done', pid: null })
    this.deps.emitStatus(superagentId, 'done')
  }

  setAutoApprove(superagentId: string, value: boolean): void {
    this.deps.store.update(superagentId, { autoApprove: value })
  }

  handleToolCall(superagentId: string, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const entry = this.active.get(superagentId)
    if (!entry) throw new Error(`Superagent ${superagentId} not active`)
    return entry.mcp.handleToolCall(name, args)
  }
}
