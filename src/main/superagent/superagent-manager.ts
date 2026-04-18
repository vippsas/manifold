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
  }
  runtimes: { getRuntimeById: (id: string) => { id: string; binary: string; args?: string[] } | undefined }
  mcpBridge: McpBridgeServer
  emitStatus: (superagentId: string, status: AgentStatus) => void
  emitListChanged: () => void
  emitChildSpawned: (superagentId: string, sessionId: string) => void
  emitOutput: (superagentId: string, chunk: string) => void
}

export class SuperagentManager {
  private readonly active = new Map<string, { ptyId: string; mcp: OrchestratorMcpServer }>()

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

    const prompt = buildOrchestratorPrompt({
      taskDescription: options.taskDescription,
      initialPrompt: options.initialPrompt,
      fleet,
    })

    const handle = this.deps.ptyPool.spawn(
      runtime.binary,
      [...(runtime.args ?? []), '--mcp-config', mcpConfigPath, '--strict-mcp-config'],
      {
        cwd: coordinationPath,
        env: {
          MANIFOLD_SUPERAGENT_ID: id,
          MANIFOLD_MCP_SOCKET: this.deps.mcpBridge.socketPath,
        },
      },
    )

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
      onChildSpawned: (sessionId) => {
        this.deps.store.addChild(id, sessionId)
        this.deps.emitChildSpawned(id, sessionId)
      },
    })

    this.deps.ptyPool.onData(handle.id, (data) => {
      this.deps.emitOutput(id, data)
    })
    this.deps.ptyPool.onExit(handle.id, () => {
      this.deps.store.update(id, { status: 'done', pid: null })
      this.deps.emitStatus(id, 'done')
      this.deps.emitListChanged()
      this.active.delete(id)
    })
    this.active.set(id, { ptyId: handle.id, mcp })

    this.deps.ptyPool.write(handle.id, `${prompt}\r`)
    this.deps.emitListChanged()

    return superagent
  }

  async kill(superagentId: string): Promise<void> {
    const entry = this.active.get(superagentId)
    if (entry) {
      this.deps.ptyPool.kill(entry.ptyId)
      this.active.delete(superagentId)
    }
    this.deps.store.update(superagentId, { status: 'done', pid: null })
    this.deps.emitStatus(superagentId, 'done')
    this.deps.emitListChanged()
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
