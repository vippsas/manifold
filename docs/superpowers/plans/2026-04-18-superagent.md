# Superagent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new session type "superagent" — an LLM orchestrator that spawns and controls child agent sessions across multiple repos via a local MCP server, with per-tool-call user approval.

**Architecture:** A `Superagent` is a new top-level entity (separate from `AgentSession`) persisted to `~/.manifold/superagents.json`. It owns a Claude Code PTY wired to a local MCP server (`OrchestratorMcpServer`) that exposes 7 tools (`list_projects`, `spawn_agent`, `send_prompt`, `read_output`, `read_status`, `read_diff`, `stop_agent`). Mutating tools route through an `ApprovalBroker` that pauses until the renderer approves. Child agents are normal `AgentSession`s with a new `parentSuperagentId` field linking them back.

**Tech Stack:** Electron (main + preload + renderer), TypeScript, React, vitest, node-pty, dockview, new dep `@modelcontextprotocol/sdk`.

**Spec:** `docs/superpowers/specs/2026-04-17-superagent-design.md`

---

## File Structure

### New files (main process)
- `src/shared/superagent-types.ts` — `Superagent`, `SuperagentCreateOptions`, approval payloads
- `src/main/superagent/superagent-store.ts` — JSON persistence at `~/.manifold/superagents.json`
- `src/main/superagent/superagent-store.test.ts`
- `src/main/superagent/approval-broker.ts` — promise-based approval gate
- `src/main/superagent/approval-broker.test.ts`
- `src/main/superagent/orchestrator-mcp-server.ts` — MCP server with 7 tools
- `src/main/superagent/orchestrator-mcp-server.test.ts`
- `src/main/superagent/superagent-manager.ts` — lifecycle (create/kill/list)
- `src/main/superagent/superagent-manager.test.ts`
- `src/main/superagent/orchestrator-prompt.ts` — initial prompt template for the orchestrator
- `src/main/ipc/superagent-handlers.ts` — IPC wiring

### New files (renderer)
- `src/renderer/hooks/useSuperagents.ts` — list + create + kill
- `src/renderer/hooks/useSuperagents.test.ts`
- `src/renderer/hooks/useApprovalInbox.ts` — subscribe + respond to approval requests
- `src/renderer/hooks/useApprovalInbox.test.ts`
- `src/renderer/components/modals/NewSuperagentModal.tsx`
- `src/renderer/components/modals/NewSuperagentModal.styles.ts`
- `src/renderer/components/superagent/SuperagentView.tsx` — top-level layout for a superagent tab
- `src/renderer/components/superagent/SuperagentView.styles.ts`
- `src/renderer/components/superagent/FleetPanel.tsx` — right pane, child cards
- `src/renderer/components/superagent/FleetPanel.styles.ts`
- `src/renderer/components/superagent/ChildAgentCard.tsx`
- `src/renderer/components/superagent/ApprovalInbox.tsx` — bottom strip
- `src/renderer/components/superagent/ApprovalInbox.styles.ts`
- `src/renderer/components/sidebar/SuperagentList.tsx` — sidebar section

### Modified files
- `src/shared/types.ts` — add `parentSuperagentId?: string` to `AgentSession`
- `src/main/app/index.ts` — instantiate `SuperagentStore`, `ApprovalBroker`, `SuperagentManager`
- `src/main/app/ipc-handlers.ts` — wire new deps, register `registerSuperagentHandlers`
- `src/main/ipc/types.ts` — add superagent deps to `IpcDependencies`
- `src/preload/index.ts` — add channels to allowlists
- `src/renderer/App.tsx` — branch rendering: superagent tab vs. project tab
- `src/renderer/components/sidebar/ProjectSidebar.tsx` — mount `SuperagentList` section
- `src/renderer/components/modals/NewAgentPopover.tsx` — add "New Superagent" option in the creation entry point (or add new popover wrapper)
- `package.json` — add `@modelcontextprotocol/sdk` dep

---

## Conventions

- **IPC naming:** `superagent:<action>` for invokes, `superagent:<event>` for push events
- **Tests:** co-located `*.test.ts` using vitest (`vi.mock`, factory mocks) following `src/main/session/session-manager.test.ts` for main and `src/renderer/hooks/useAgentSession.test.ts` for renderer hooks
- **Commit prefix:** `feat(superagent): …` unless a task is refactor-only (`refactor(superagent): …`)
- **Run commands:**
  - single test file: `npx vitest run <path>`
  - typecheck: `npm run typecheck`
  - full suite: `npm test`
- **Completion gate per task:** the step "commit" runs only after `npm run typecheck && npx vitest run <changed test files>` passes

---

## Task 1: Shared types — `Superagent` + `parentSuperagentId`

**Files:**
- Create: `src/shared/superagent-types.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Create `Superagent` type file**

Create `src/shared/superagent-types.ts`:
```ts
import type { AgentStatus } from './types'

export interface Superagent {
  id: string
  name: string
  taskDescription: string
  runtimeId: 'claude'
  fleetProjectIds: string[]
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
  fleetProjectIds: string[]
  initialPrompt: string
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
```

- [ ] **Step 2: Add `parentSuperagentId` to `AgentSession`**

Edit `src/shared/types.ts`. In the `AgentSession` interface, add after `noWorktree?: boolean`:
```ts
  /** If set, this agent was spawned by a superagent and is listed as a child. */
  parentSuperagentId?: string
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/shared/superagent-types.ts src/shared/types.ts
git commit -m "feat(superagent): add Superagent shared types and parentSuperagentId"
```

---

## Task 2: `SuperagentStore` — JSON persistence

**Files:**
- Create: `src/main/superagent/superagent-store.ts`
- Test: `src/main/superagent/superagent-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/superagent/superagent-store.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { SuperagentStore } from './superagent-store'
import type { Superagent } from '../../shared/superagent-types'

function makeSuperagent(overrides: Partial<Superagent> = {}): Superagent {
  return {
    id: 's1',
    name: 'test',
    taskDescription: 'desc',
    runtimeId: 'claude',
    fleetProjectIds: ['p1'],
    childSessionIds: [],
    coordinationPath: '/tmp/coord',
    createdAt: '2026-04-18T00:00:00.000Z',
    pid: null,
    status: 'running',
    autoApprove: false,
    ...overrides,
  }
}

describe('SuperagentStore', () => {
  let tmpDir: string
  let storePath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-store-'))
    storePath = path.join(tmpDir, 'superagents.json')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns empty list when no file exists', () => {
    const store = new SuperagentStore(storePath)
    expect(store.list()).toEqual([])
  })

  it('persists and reloads superagents', () => {
    const store = new SuperagentStore(storePath)
    store.add(makeSuperagent({ id: 's1' }))
    store.add(makeSuperagent({ id: 's2', name: 'other' }))
    const reloaded = new SuperagentStore(storePath)
    expect(reloaded.list().map((s) => s.id).sort()).toEqual(['s1', 's2'])
  })

  it('updates a superagent by id', () => {
    const store = new SuperagentStore(storePath)
    store.add(makeSuperagent({ id: 's1', status: 'running' }))
    const updated = store.update('s1', { status: 'done' })
    expect(updated?.status).toBe('done')
    expect(store.get('s1')?.status).toBe('done')
  })

  it('returns undefined when updating missing id', () => {
    const store = new SuperagentStore(storePath)
    expect(store.update('missing', { status: 'done' })).toBeUndefined()
  })

  it('removes a superagent by id', () => {
    const store = new SuperagentStore(storePath)
    store.add(makeSuperagent({ id: 's1' }))
    expect(store.remove('s1')).toBe(true)
    expect(store.list()).toEqual([])
  })

  it('appends a child session id', () => {
    const store = new SuperagentStore(storePath)
    store.add(makeSuperagent({ id: 's1', childSessionIds: [] }))
    store.addChild('s1', 'child-1')
    expect(store.get('s1')?.childSessionIds).toEqual(['child-1'])
  })

  it('tolerates a malformed file by starting empty', () => {
    fs.writeFileSync(storePath, 'not json')
    const store = new SuperagentStore(storePath)
    expect(store.list()).toEqual([])
  })
})
```

- [ ] **Step 2: Verify test fails**

Run: `npx vitest run src/main/superagent/superagent-store.test.ts`
Expected: FAIL — cannot find module `./superagent-store`

- [ ] **Step 3: Implement `SuperagentStore`**

Create `src/main/superagent/superagent-store.ts`:
```ts
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Superagent } from '../../shared/superagent-types'

export class SuperagentStore {
  private superagents: Superagent[]

  constructor(private readonly filePath: string) {
    this.superagents = this.loadFromDisk()
  }

  private loadFromDisk(): Superagent[] {
    try {
      if (!fs.existsSync(this.filePath)) return []
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as Superagent[]) : []
    } catch {
      return []
    }
  }

  private writeToDisk(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(this.superagents, null, 2))
  }

  list(): Superagent[] {
    return [...this.superagents]
  }

  get(id: string): Superagent | undefined {
    return this.superagents.find((s) => s.id === id)
  }

  add(superagent: Superagent): void {
    this.superagents.push(superagent)
    this.writeToDisk()
  }

  update(id: string, partial: Partial<Superagent>): Superagent | undefined {
    const idx = this.superagents.findIndex((s) => s.id === id)
    if (idx === -1) return undefined
    this.superagents[idx] = { ...this.superagents[idx], ...partial }
    this.writeToDisk()
    return this.superagents[idx]
  }

  remove(id: string): boolean {
    const before = this.superagents.length
    this.superagents = this.superagents.filter((s) => s.id !== id)
    if (this.superagents.length === before) return false
    this.writeToDisk()
    return true
  }

  addChild(id: string, childSessionId: string): void {
    const target = this.superagents.find((s) => s.id === id)
    if (!target) return
    if (!target.childSessionIds.includes(childSessionId)) {
      target.childSessionIds.push(childSessionId)
      this.writeToDisk()
    }
  }
}
```

- [ ] **Step 4: Verify test passes**

Run: `npx vitest run src/main/superagent/superagent-store.test.ts`
Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/superagent/superagent-store.ts src/main/superagent/superagent-store.test.ts
git commit -m "feat(superagent): add SuperagentStore with JSON persistence"
```

---

## Task 3: `ApprovalBroker` — promise-based gate

**Files:**
- Create: `src/main/superagent/approval-broker.ts`
- Test: `src/main/superagent/approval-broker.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/superagent/approval-broker.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApprovalBroker } from './approval-broker'
import type { ApprovalRequest } from '../../shared/superagent-types'

describe('ApprovalBroker', () => {
  let broker: ApprovalBroker
  let emitted: ApprovalRequest[]

  beforeEach(() => {
    emitted = []
    broker = new ApprovalBroker({ emit: (req) => emitted.push(req) })
  })

  it('emits a request when requestApproval is called', async () => {
    broker.requestApproval('s1', 'spawn_agent', { projectId: 'p1' })
    expect(emitted).toHaveLength(1)
    expect(emitted[0].superagentId).toBe('s1')
    expect(emitted[0].toolName).toBe('spawn_agent')
  })

  it('resolves with approve when response is approve', async () => {
    const promise = broker.requestApproval('s1', 'spawn_agent', {})
    const requestId = emitted[0].requestId
    broker.respond({ requestId, decision: 'approve' })
    await expect(promise).resolves.toBe('approve')
  })

  it('resolves with deny when response is deny', async () => {
    const promise = broker.requestApproval('s1', 'send_prompt', {})
    broker.respond({ requestId: emitted[0].requestId, decision: 'deny' })
    await expect(promise).resolves.toBe('deny')
  })

  it('treats approve-all as approve and sets session auto-approve flag', async () => {
    const onAutoApprove = vi.fn()
    broker = new ApprovalBroker({ emit: (r) => emitted.push(r), onAutoApprove })
    const promise = broker.requestApproval('s1', 'spawn_agent', {})
    broker.respond({ requestId: emitted[0].requestId, decision: 'approve-all' })
    await expect(promise).resolves.toBe('approve')
    expect(onAutoApprove).toHaveBeenCalledWith('s1')
  })

  it('ignores responses with unknown requestId', () => {
    expect(() =>
      broker.respond({ requestId: 'missing', decision: 'approve' }),
    ).not.toThrow()
  })

  it('lists pending requests for a superagent', () => {
    broker.requestApproval('s1', 'spawn_agent', {})
    broker.requestApproval('s2', 'send_prompt', {})
    broker.requestApproval('s1', 'stop_agent', {})
    expect(broker.listPending('s1')).toHaveLength(2)
    expect(broker.listPending('s2')).toHaveLength(1)
  })

  it('removes request from pending after response', () => {
    broker.requestApproval('s1', 'spawn_agent', {})
    broker.respond({ requestId: emitted[0].requestId, decision: 'approve' })
    expect(broker.listPending('s1')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Verify test fails**

Run: `npx vitest run src/main/superagent/approval-broker.test.ts`
Expected: FAIL — cannot find module `./approval-broker`

- [ ] **Step 3: Implement `ApprovalBroker`**

Create `src/main/superagent/approval-broker.ts`:
```ts
import { randomUUID } from 'node:crypto'
import type {
  ApprovalRequest,
  ApprovalResponse,
  ApprovalToolName,
} from '../../shared/superagent-types'

type Decision = 'approve' | 'deny'

export interface ApprovalBrokerDeps {
  emit: (request: ApprovalRequest) => void
  onAutoApprove?: (superagentId: string) => void
}

interface PendingEntry {
  request: ApprovalRequest
  resolve: (decision: Decision) => void
}

export class ApprovalBroker {
  private readonly pending = new Map<string, PendingEntry>()

  constructor(private readonly deps: ApprovalBrokerDeps) {}

  requestApproval(
    superagentId: string,
    toolName: ApprovalToolName,
    args: Record<string, unknown>,
  ): Promise<Decision> {
    const request: ApprovalRequest = {
      requestId: randomUUID(),
      superagentId,
      toolName,
      args,
      requestedAt: Date.now(),
    }
    const promise = new Promise<Decision>((resolve) => {
      this.pending.set(request.requestId, { request, resolve })
    })
    this.deps.emit(request)
    return promise
  }

  respond(response: ApprovalResponse): void {
    const entry = this.pending.get(response.requestId)
    if (!entry) return
    this.pending.delete(response.requestId)
    if (response.decision === 'approve-all') {
      this.deps.onAutoApprove?.(entry.request.superagentId)
      entry.resolve('approve')
    } else {
      entry.resolve(response.decision)
    }
  }

  listPending(superagentId: string): ApprovalRequest[] {
    return [...this.pending.values()]
      .filter((e) => e.request.superagentId === superagentId)
      .map((e) => e.request)
  }
}
```

- [ ] **Step 4: Verify test passes**

Run: `npx vitest run src/main/superagent/approval-broker.test.ts`
Expected: all 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/superagent/approval-broker.ts src/main/superagent/approval-broker.test.ts
git commit -m "feat(superagent): add ApprovalBroker for tool-call gating"
```

---

## Task 4: Install MCP SDK

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the SDK**

Run: `npm install @modelcontextprotocol/sdk`
Expected: installs latest, updates `package.json` and `package-lock.json`.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no code uses it yet)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(superagent): add @modelcontextprotocol/sdk dependency"
```

---

## Task 5: `OrchestratorMcpServer` — tool surface (read-only tools)

The MCP server lives in the main process and is exposed to the orchestrator via stdio. For v1 we define it as an in-process object with a `handleToolCall` method. The stdio transport wiring happens in Task 8 alongside `SuperagentManager`.

**Files:**
- Create: `src/main/superagent/orchestrator-mcp-server.ts`
- Test: `src/main/superagent/orchestrator-mcp-server.test.ts`

- [ ] **Step 1: Write the failing test for read-only tools**

Create `src/main/superagent/orchestrator-mcp-server.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OrchestratorMcpServer } from './orchestrator-mcp-server'
import type { Superagent } from '../../shared/superagent-types'
import type { AgentSession } from '../../shared/types'

function makeSuperagent(): Superagent {
  return {
    id: 'super-1',
    name: 'test',
    taskDescription: 't',
    runtimeId: 'claude',
    fleetProjectIds: ['p1', 'p2'],
    childSessionIds: [],
    coordinationPath: '/tmp/super-1',
    createdAt: '2026-04-18T00:00:00.000Z',
    pid: null,
    status: 'running',
    autoApprove: false,
  }
}

function makeDeps(over: Partial<Parameters<typeof OrchestratorMcpServer.prototype.constructor>[0]> = {}) {
  const superagent = makeSuperagent()
  return {
    superagentId: superagent.id,
    getSuperagent: vi.fn(() => superagent),
    projectRegistry: {
      getProject: vi.fn((id: string) => ({ id, name: `name-${id}`, path: `/repo/${id}`, baseBranch: 'main', addedAt: '' })),
      listProjects: vi.fn(() => []),
    } as any,
    sessionManager: {
      getSession: vi.fn<(id: string) => AgentSession | undefined>(),
      createSession: vi.fn(),
      killSession: vi.fn(),
      getOutput: vi.fn(() => ''),
      sendInput: vi.fn(),
    } as any,
    diffProvider: {
      getDiff: vi.fn(async () => 'diff output'),
    } as any,
    approvalBroker: { requestApproval: vi.fn(async () => 'approve') } as any,
    getAutoApprove: vi.fn(() => false),
    ...over,
  }
}

describe('OrchestratorMcpServer — read-only tools', () => {
  let deps: ReturnType<typeof makeDeps>
  let server: OrchestratorMcpServer

  beforeEach(() => {
    deps = makeDeps()
    server = new OrchestratorMcpServer(deps)
  })

  it('list_projects returns the fleet only', async () => {
    const result = await server.handleToolCall('list_projects', {})
    expect(result).toEqual({
      projects: [
        { id: 'p1', name: 'name-p1', path: '/repo/p1' },
        { id: 'p2', name: 'name-p2', path: '/repo/p2' },
      ],
    })
  })

  it('read_status returns status + pid + lastOutputTime for a child', async () => {
    deps.sessionManager.getSession = vi.fn(() => ({
      id: 'child-1',
      status: 'running',
      pid: 42,
      projectId: 'p1',
      runtimeId: 'claude',
      branchName: 'b',
      worktreePath: '/w',
      additionalDirs: [],
      parentSuperagentId: 'super-1',
    }))
    const result = await server.handleToolCall('read_status', { sessionId: 'child-1' })
    expect(result).toMatchObject({ status: 'running', pid: 42 })
  })

  it('read_status errors when sessionId is not a child of this superagent', async () => {
    deps.sessionManager.getSession = vi.fn(() => ({
      id: 'other',
      parentSuperagentId: 'different-super',
    }) as any)
    await expect(
      server.handleToolCall('read_status', { sessionId: 'other' }),
    ).rejects.toThrow(/not a child/)
  })

  it('read_output returns the session output buffer', async () => {
    deps.sessionManager.getSession = vi.fn(() => ({ id: 'c1', parentSuperagentId: 'super-1' }) as any)
    deps.sessionManager.getOutput = vi.fn(() => 'hello world')
    const result = await server.handleToolCall('read_output', { sessionId: 'c1' })
    expect(result).toEqual({ text: 'hello world' })
  })

  it('read_diff returns the session diff', async () => {
    deps.sessionManager.getSession = vi.fn(() => ({ id: 'c1', parentSuperagentId: 'super-1' }) as any)
    const result = await server.handleToolCall('read_diff', { sessionId: 'c1' })
    expect(result).toEqual({ diff: 'diff output' })
  })

  it('unknown tool throws', async () => {
    await expect(server.handleToolCall('bogus', {})).rejects.toThrow(/unknown tool/i)
  })
})
```

- [ ] **Step 2: Verify test fails**

Run: `npx vitest run src/main/superagent/orchestrator-mcp-server.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement the server (read-only tools only)**

Create `src/main/superagent/orchestrator-mcp-server.ts`:
```ts
import type { Superagent } from '../../shared/superagent-types'
import type { AgentSession, SpawnAgentOptions } from '../../shared/types'
import type { ApprovalBroker } from './approval-broker'

interface ProjectLike {
  id: string
  name: string
  path: string
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
    getOutput: (id: string) => string
    sendInput: (id: string, data: string) => void
  }
  diffProvider: {
    getDiff: (worktreePath: string, baseBranch: string) => Promise<string>
  }
  approvalBroker: ApprovalBroker
  getAutoApprove: () => boolean
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

  private async handleGated(_name: string, _args: Record<string, unknown>): Promise<ToolResult> {
    // Implemented in Task 6.
    throw new Error('Gated tools not yet implemented')
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
    return { text: this.deps.sessionManager.getOutput(sessionId) }
  }

  private async readDiff(sessionId: string): Promise<ToolResult> {
    const session = this.requireChildSession(sessionId)
    const project = this.deps.projectRegistry.getProject(session.projectId)
    const baseBranch = (project as any)?.baseBranch ?? 'main'
    const diff = await this.deps.diffProvider.getDiff(session.worktreePath, baseBranch)
    return { diff }
  }
}
```

Note: `SessionManager` may not currently expose `getOutput(id)`. If it does not, add a thin accessor that reads `InternalSession.outputBuffer`. Check `src/main/session/session-manager.ts` for an existing method (look for `getSession`, `getOutput`, `getBuffer`) — if missing, add:
```ts
getOutput(sessionId: string): string {
  return this.sessions.get(sessionId)?.outputBuffer ?? ''
}
```
in the same pass and export the method. Same for `sendInput(sessionId, data)` — if it's already `writeToSession` or similar, either rename the call site in `OrchestratorDeps` or add a matching wrapper.

- [ ] **Step 4: Verify test passes**

Run: `npx vitest run src/main/superagent/orchestrator-mcp-server.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/superagent/orchestrator-mcp-server.ts src/main/superagent/orchestrator-mcp-server.test.ts src/main/session/session-manager.ts
git commit -m "feat(superagent): add OrchestratorMcpServer read-only tools"
```

---

## Task 6: `OrchestratorMcpServer` — gated tools (`spawn_agent`, `send_prompt`, `stop_agent`)

**Files:**
- Modify: `src/main/superagent/orchestrator-mcp-server.ts`
- Modify: `src/main/superagent/orchestrator-mcp-server.test.ts`

- [ ] **Step 1: Add failing tests for gated tools**

Append to `src/main/superagent/orchestrator-mcp-server.test.ts` (in same `describe` file, add a new describe block):

```ts
describe('OrchestratorMcpServer — gated tools', () => {
  let deps: ReturnType<typeof makeDeps>
  let server: OrchestratorMcpServer

  beforeEach(() => {
    deps = makeDeps()
    server = new OrchestratorMcpServer(deps)
  })

  it('spawn_agent requests approval, then calls createSession on approve', async () => {
    deps.approvalBroker.requestApproval = vi.fn(async () => 'approve')
    deps.sessionManager.createSession = vi.fn(async () => ({
      id: 'child-1',
      projectId: 'p1',
      runtimeId: 'claude',
      branchName: 'b',
      worktreePath: '/w',
      status: 'running',
      pid: 1,
      additionalDirs: [],
      parentSuperagentId: 'super-1',
    }))
    const result = await server.handleToolCall('spawn_agent', {
      projectId: 'p1',
      runtime: 'claude',
      prompt: 'hello',
    })
    expect(deps.approvalBroker.requestApproval).toHaveBeenCalledWith(
      'super-1',
      'spawn_agent',
      expect.objectContaining({ projectId: 'p1', runtime: 'claude', prompt: 'hello' }),
    )
    expect(deps.sessionManager.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'p1',
        runtimeId: 'claude',
        prompt: 'hello',
        parentSuperagentId: 'super-1',
      }),
    )
    expect(result).toEqual({ sessionId: 'child-1' })
  })

  it('spawn_agent returns denied error without calling createSession', async () => {
    deps.approvalBroker.requestApproval = vi.fn(async () => 'deny')
    deps.sessionManager.createSession = vi.fn()
    await expect(
      server.handleToolCall('spawn_agent', { projectId: 'p1', runtime: 'claude', prompt: 'x' }),
    ).rejects.toThrow(/denied/i)
    expect(deps.sessionManager.createSession).not.toHaveBeenCalled()
  })

  it('spawn_agent rejects projectId not in fleet', async () => {
    await expect(
      server.handleToolCall('spawn_agent', { projectId: 'not-in-fleet', runtime: 'claude', prompt: 'x' }),
    ).rejects.toThrow(/not in fleet/i)
  })

  it('send_prompt approves, then writes to PTY', async () => {
    deps.sessionManager.getSession = vi.fn(() => ({ id: 'c1', parentSuperagentId: 'super-1' }) as any)
    deps.approvalBroker.requestApproval = vi.fn(async () => 'approve')
    await server.handleToolCall('send_prompt', { sessionId: 'c1', prompt: 'hi' })
    expect(deps.sessionManager.sendInput).toHaveBeenCalledWith('c1', 'hi\r')
  })

  it('stop_agent approves, then kills', async () => {
    deps.sessionManager.getSession = vi.fn(() => ({ id: 'c1', parentSuperagentId: 'super-1' }) as any)
    deps.approvalBroker.requestApproval = vi.fn(async () => 'approve')
    await server.handleToolCall('stop_agent', { sessionId: 'c1' })
    expect(deps.sessionManager.killSession).toHaveBeenCalledWith('c1')
  })

  it('gated tool skips approval when autoApprove is on', async () => {
    deps.getAutoApprove = vi.fn(() => true)
    deps.approvalBroker.requestApproval = vi.fn()
    deps.sessionManager.createSession = vi.fn(async () => ({ id: 'c1' }) as any)
    await server.handleToolCall('spawn_agent', { projectId: 'p1', runtime: 'claude', prompt: 'x' })
    expect(deps.approvalBroker.requestApproval).not.toHaveBeenCalled()
    expect(deps.sessionManager.createSession).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Verify new tests fail**

Run: `npx vitest run src/main/superagent/orchestrator-mcp-server.test.ts`
Expected: 6 passes (from Task 5), 6 new FAILs (`Gated tools not yet implemented` / mismatch).

- [ ] **Step 3: Replace the `handleGated` stub**

In `src/main/superagent/orchestrator-mcp-server.ts`, replace the `handleGated` method:
```ts
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
```

Also extend `SpawnAgentOptions` in `src/shared/types.ts` to accept `parentSuperagentId?: string`:
```ts
  parentSuperagentId?: string
```
and thread it through `SessionManager.createSession` → `SessionCreator.create` → `InternalSession` → returned `AgentSession` (it flows naturally if you copy it along with the other options).

- [ ] **Step 4: Verify all tests pass**

Run: `npx vitest run src/main/superagent/orchestrator-mcp-server.test.ts`
Expected: all 12 tests PASS

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/superagent/orchestrator-mcp-server.ts src/main/superagent/orchestrator-mcp-server.test.ts src/shared/types.ts src/main/session/session-manager.ts src/main/session/session-creator.ts src/main/session/session-types.ts
git commit -m "feat(superagent): implement gated MCP tools with approval flow"
```

---

## Task 7: `SuperagentManager` — lifecycle

**Files:**
- Create: `src/main/superagent/orchestrator-prompt.ts`
- Create: `src/main/superagent/superagent-manager.ts`
- Test: `src/main/superagent/superagent-manager.test.ts`

- [ ] **Step 1: Create the prompt template**

Create `src/main/superagent/orchestrator-prompt.ts`:
```ts
import type { Project } from '../../shared/types'

export interface OrchestratorPromptInput {
  taskDescription: string
  initialPrompt: string
  fleet: Project[]
}

export function buildOrchestratorPrompt({
  taskDescription,
  initialPrompt,
  fleet,
}: OrchestratorPromptInput): string {
  const fleetList = fleet.map((p) => `- ${p.name} (id=${p.id}, path=${p.path}, base=${p.baseBranch})`).join('\n')
  return [
    'You are a Manifold superagent — an orchestrator that coordinates work across multiple repos by calling MCP tools to spawn and control child agents.',
    '',
    `Task: ${taskDescription}`,
    '',
    'Fleet:',
    fleetList,
    '',
    'You have these tools (call via MCP):',
    '- list_projects() — list the fleet',
    '- spawn_agent({ projectId, runtime, prompt }) — start a child agent session',
    '- send_prompt({ sessionId, prompt }) — send a follow-up prompt to a child',
    '- read_output({ sessionId }) — read a child’s recent output',
    '- read_status({ sessionId }) — status + pid',
    '- read_diff({ sessionId }) — diff of the child’s branch vs. base',
    '- stop_agent({ sessionId }) — terminate a child',
    '',
    'Plan the work, spawn children as needed, check their output and diffs, and report progress to the user.',
    '',
    `User: ${initialPrompt}`,
  ].join('\n')
}
```

- [ ] **Step 2: Write the failing test for `SuperagentManager`**

Create `src/main/superagent/superagent-manager.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { SuperagentManager } from './superagent-manager'
import { SuperagentStore } from './superagent-store'
import { ApprovalBroker } from './approval-broker'

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto')
  let c = 0
  return { ...actual, randomUUID: () => `uuid-${++c}` }
})

function makeDeps(tmpDir: string) {
  return {
    store: new SuperagentStore(path.join(tmpDir, 'superagents.json')),
    storageRoot: tmpDir,
    approvalBroker: new ApprovalBroker({ emit: vi.fn() }),
    projectRegistry: {
      getProject: vi.fn((id: string) => ({ id, name: id, path: `/r/${id}`, baseBranch: 'main', addedAt: '' })),
      listProjects: vi.fn(() => []),
    } as any,
    sessionManager: {
      getSession: vi.fn(),
      createSession: vi.fn(),
      killSession: vi.fn(),
      getOutput: vi.fn(() => ''),
      sendInput: vi.fn(),
    } as any,
    diffProvider: { getDiff: vi.fn(async () => '') } as any,
    ptyPool: {
      spawn: vi.fn(() => ({ id: 'pty-1', pid: 99 })),
      kill: vi.fn(),
      onData: vi.fn(() => () => undefined),
      onExit: vi.fn(() => () => undefined),
      write: vi.fn(),
    } as any,
    runtimes: { getRuntimeById: vi.fn(() => ({ id: 'claude', name: 'Claude', binary: 'claude', args: [] })) } as any,
    emitStatus: vi.fn(),
  }
}

describe('SuperagentManager', () => {
  let tmpDir: string
  let deps: ReturnType<typeof makeDeps>
  let manager: SuperagentManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-mgr-'))
    deps = makeDeps(tmpDir)
    manager = new SuperagentManager(deps)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates a superagent: store entry, coordination dir, PTY spawned', async () => {
    const s = await manager.create({
      name: 'n',
      taskDescription: 'd',
      fleetProjectIds: ['p1'],
      initialPrompt: 'start',
    })
    expect(s.id).toBe('uuid-1')
    expect(s.runtimeId).toBe('claude')
    expect(s.pid).toBe(99)
    expect(fs.existsSync(s.coordinationPath)).toBe(true)
    expect(deps.ptyPool.spawn).toHaveBeenCalled()
    expect(deps.store.get('uuid-1')).toBeDefined()
  })

  it('create rejects empty fleet', async () => {
    await expect(
      manager.create({ name: 'n', taskDescription: 'd', fleetProjectIds: [], initialPrompt: 'x' }),
    ).rejects.toThrow(/fleet/i)
  })

  it('list returns superagents', async () => {
    await manager.create({ name: 'a', taskDescription: 'd', fleetProjectIds: ['p1'], initialPrompt: 'x' })
    expect(manager.list()).toHaveLength(1)
  })

  it('kill tears down PTY and marks session done', async () => {
    const s = await manager.create({ name: 'n', taskDescription: 'd', fleetProjectIds: ['p1'], initialPrompt: 'x' })
    await manager.kill(s.id)
    expect(deps.ptyPool.kill).toHaveBeenCalled()
    expect(deps.store.get(s.id)?.status).toBe('done')
  })

  it('setAutoApprove persists the flag', async () => {
    const s = await manager.create({ name: 'n', taskDescription: 'd', fleetProjectIds: ['p1'], initialPrompt: 'x' })
    manager.setAutoApprove(s.id, true)
    expect(deps.store.get(s.id)?.autoApprove).toBe(true)
  })
})
```

- [ ] **Step 3: Verify test fails**

Run: `npx vitest run src/main/superagent/superagent-manager.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 4: Implement `SuperagentManager`**

Create `src/main/superagent/superagent-manager.ts`:
```ts
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
    getOutput: (id: string) => string
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

    // Send initial prompt
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
```

- [ ] **Step 5: Verify tests pass**

Run: `npx vitest run src/main/superagent/superagent-manager.test.ts`
Expected: all 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/superagent/superagent-manager.ts src/main/superagent/superagent-manager.test.ts src/main/superagent/orchestrator-prompt.ts
git commit -m "feat(superagent): add SuperagentManager lifecycle"
```

---

## Task 8: MCP transport — stdio wiring

Claude Code reads MCP servers from a config file (or `--mcp-config` flag). For v1 we register a local stdio MCP server binary that the Claude Code process spawns as a subprocess. The binary forwards tool calls to the main process via a small JSON-over-stdio protocol.

Because shipping a separate binary is heavy for v1, we instead use the simpler approach: **the orchestrator CLI is spawned with `--mcp-config <path>.json`, and the config points to a tiny Node script that speaks MCP stdio and forwards to the main process over a Unix domain socket.**

**Files:**
- Create: `src/main/superagent/mcp-bridge-script.ts` — forwarder script content as a template
- Create: `src/main/superagent/mcp-bridge-server.ts` — Unix socket server hosted in main
- Modify: `src/main/superagent/superagent-manager.ts` — write config, start socket server, pass `--mcp-config`

This task is larger and has integration characteristics; if scope pressure builds, a reasonable v1 fallback is to implement only read-only tools via an even simpler mechanism (a custom CLI subcommand like `manifold-super call-tool <name> <json>`) and defer proper MCP stdio until v2. The plan below takes the proper stdio path.

- [ ] **Step 1: Write the failing test for the bridge server**

Create `src/main/superagent/mcp-bridge-server.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as net from 'node:net'
import { McpBridgeServer } from './mcp-bridge-server'

describe('McpBridgeServer', () => {
  let tmp: string
  let socketPath: string
  let server: McpBridgeServer

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-bridge-'))
    socketPath = path.join(tmp, 'bridge.sock')
    server = new McpBridgeServer({
      socketPath,
      handleToolCall: async (superagentId, name, args) => ({ echoed: { superagentId, name, args } }),
    })
  })

  afterEach(async () => {
    await server.stop()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('handles a tool call request over the socket', async () => {
    await server.start()
    const result = await new Promise<any>((resolve, reject) => {
      const client = net.createConnection(socketPath)
      client.on('connect', () => {
        client.write(JSON.stringify({ superagentId: 'S', name: 'list_projects', args: {} }) + '\n')
      })
      let buf = ''
      client.on('data', (d) => {
        buf += d.toString('utf-8')
        const nl = buf.indexOf('\n')
        if (nl >= 0) {
          try { resolve(JSON.parse(buf.slice(0, nl))) } catch (e) { reject(e) }
          client.end()
        }
      })
      client.on('error', reject)
    })
    expect(result).toMatchObject({ ok: true, result: { echoed: { superagentId: 'S', name: 'list_projects' } } })
  })

  it('returns error payload when handler throws', async () => {
    server = new McpBridgeServer({
      socketPath,
      handleToolCall: async () => { throw new Error('boom') },
    })
    await server.start()
    const result = await new Promise<any>((resolve, reject) => {
      const client = net.createConnection(socketPath)
      client.on('connect', () => client.write(JSON.stringify({ superagentId: 'S', name: 'x', args: {} }) + '\n'))
      let buf = ''
      client.on('data', (d) => {
        buf += d.toString('utf-8')
        const nl = buf.indexOf('\n')
        if (nl >= 0) { resolve(JSON.parse(buf.slice(0, nl))); client.end() }
      })
      client.on('error', reject)
    })
    expect(result).toMatchObject({ ok: false, error: 'boom' })
  })
})
```

- [ ] **Step 2: Verify the test fails**

Run: `npx vitest run src/main/superagent/mcp-bridge-server.test.ts`
Expected: FAIL — cannot find module `./mcp-bridge-server`

- [ ] **Step 3: Implement `McpBridgeServer`**

Create `src/main/superagent/mcp-bridge-server.ts`:
```ts
import * as net from 'node:net'
import * as fs from 'node:fs'

export interface McpBridgeServerDeps {
  socketPath: string
  handleToolCall: (superagentId: string, name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>
}

export class McpBridgeServer {
  private server: net.Server | null = null

  constructor(private readonly deps: McpBridgeServerDeps) {}

  async start(): Promise<void> {
    try { fs.unlinkSync(this.deps.socketPath) } catch { /* not present */ }
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        let buf = ''
        socket.on('data', async (chunk) => {
          buf += chunk.toString('utf-8')
          let idx: number
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx)
            buf = buf.slice(idx + 1)
            if (!line.trim()) continue
            let reply: Record<string, unknown>
            try {
              const msg = JSON.parse(line) as { superagentId: string; name: string; args: Record<string, unknown> }
              const result = await this.deps.handleToolCall(msg.superagentId, msg.name, msg.args)
              reply = { ok: true, result }
            } catch (err) {
              reply = { ok: false, error: err instanceof Error ? err.message : String(err) }
            }
            socket.write(JSON.stringify(reply) + '\n')
          }
        })
      })
      server.once('error', reject)
      server.listen(this.deps.socketPath, () => {
        this.server = server
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    if (!this.server) return
    await new Promise<void>((resolve) => this.server!.close(() => resolve()))
    try { fs.unlinkSync(this.deps.socketPath) } catch { /* ignore */ }
    this.server = null
  }
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run src/main/superagent/mcp-bridge-server.test.ts`
Expected: 2 tests PASS

- [ ] **Step 5: Create the forwarder script template**

Create `src/main/superagent/mcp-bridge-script.ts`:
```ts
/**
 * Content for the tiny Node script that Claude Code will spawn as its MCP server.
 * The script connects to the main process over a Unix socket and speaks the MCP
 * stdio protocol, forwarding tool calls to the main process.
 *
 * We ship this as a literal string that the main process writes to disk on superagent
 * create; the script imports only built-in node modules so no bundling is required.
 */
export const MCP_BRIDGE_SCRIPT = `#!/usr/bin/env node
const net = require('node:net')
const readline = require('node:readline')
const SOCKET_PATH = process.env.MANIFOLD_MCP_SOCKET
const SUPERAGENT_ID = process.env.MANIFOLD_SUPERAGENT_ID
if (!SOCKET_PATH || !SUPERAGENT_ID) {
  console.error('MANIFOLD_MCP_SOCKET and MANIFOLD_SUPERAGENT_ID must be set')
  process.exit(1)
}

function send(obj) { process.stdout.write(JSON.stringify(obj) + '\\n') }

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', async (line) => {
  let msg; try { msg = JSON.parse(line) } catch { return }
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'manifold-orchestrator', version: '0.1.0' } } })
    return
  }
  if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools: require('./tool-schemas.json') } })
    return
  }
  if (msg.method === 'tools/call') {
    const { name, arguments: args } = msg.params
    const client = net.createConnection(SOCKET_PATH)
    let buf = ''
    client.on('connect', () => client.write(JSON.stringify({ superagentId: SUPERAGENT_ID, name, args }) + '\\n'))
    client.on('data', (d) => {
      buf += d.toString('utf-8')
      const nl = buf.indexOf('\\n')
      if (nl < 0) return
      const parsed = JSON.parse(buf.slice(0, nl))
      client.end()
      if (parsed.ok) {
        send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: JSON.stringify(parsed.result) }] } })
      } else {
        send({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: parsed.error } })
      }
    })
    client.on('error', (e) => {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32001, message: e.message } })
    })
  }
})
`

export const TOOL_SCHEMAS = [
  { name: 'list_projects', description: 'List the fleet of projects this superagent may touch', inputSchema: { type: 'object', properties: {} } },
  { name: 'spawn_agent', description: 'Spawn a child agent in a project', inputSchema: { type: 'object', required: ['projectId', 'runtime', 'prompt'], properties: { projectId: { type: 'string' }, runtime: { type: 'string' }, prompt: { type: 'string' }, branchName: { type: 'string' } } } },
  { name: 'send_prompt', description: 'Send a prompt to a running child', inputSchema: { type: 'object', required: ['sessionId', 'prompt'], properties: { sessionId: { type: 'string' }, prompt: { type: 'string' } } } },
  { name: 'read_output', description: 'Read recent output from a child', inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' } } } },
  { name: 'read_status', description: 'Read status of a child', inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' } } } },
  { name: 'read_diff', description: "Read a child's branch diff", inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' } } } },
  { name: 'stop_agent', description: 'Terminate a child', inputSchema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string' } } } },
]
```

- [ ] **Step 6: Wire the bridge into `SuperagentManager.create`**

Edit `src/main/superagent/superagent-manager.ts`. Add dependency `mcpBridge: McpBridgeServer` to `SuperagentManagerDeps`. In `create()`, before spawning the PTY:
- Write `mcp-bridge.js` from `MCP_BRIDGE_SCRIPT` into `coordinationPath`
- Write `tool-schemas.json` from `TOOL_SCHEMAS` into `coordinationPath`
- Build an `mcp-config.json`:
  ```json
  { "mcpServers": { "manifold-orchestrator": { "command": "node", "args": ["./mcp-bridge.js"] } } }
  ```
- Pass `--mcp-config ./mcp-config.json` by extending `args` when calling `ptyPool.spawn` (note: different Claude Code versions use different flags; check with `claude --help` — update this task with the correct flag before execution)
- Set env vars `MANIFOLD_MCP_SOCKET` (the bridge socket path), `MANIFOLD_SUPERAGENT_ID`

In `app/index.ts`, start the bridge server at app startup with a socket path under `~/.manifold/mcp-bridge.sock`, and pass `handleToolCall` that delegates to `SuperagentManager.handleToolCall`.

Add these wire-up changes in `src/main/app/index.ts` alongside the existing main-process module instantiation.

- [ ] **Step 7: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/main/superagent/mcp-bridge-server.ts src/main/superagent/mcp-bridge-server.test.ts src/main/superagent/mcp-bridge-script.ts src/main/superagent/superagent-manager.ts src/main/app/index.ts
git commit -m "feat(superagent): wire MCP stdio bridge for orchestrator"
```

---

## Task 9: IPC handlers

**Files:**
- Create: `src/main/ipc/superagent-handlers.ts`
- Modify: `src/main/ipc/types.ts`
- Modify: `src/main/app/ipc-handlers.ts`

- [ ] **Step 1: Add superagent deps to IPC types**

In `src/main/ipc/types.ts`, add to `IpcDependencies`:
```ts
  superagentManager: import('../superagent/superagent-manager').SuperagentManager
  approvalBroker: import('../superagent/approval-broker').ApprovalBroker
```

- [ ] **Step 2: Create handler file**

Create `src/main/ipc/superagent-handlers.ts`:
```ts
import { ipcMain } from 'electron'
import type { IpcDependencies } from './types'
import type { SuperagentCreateOptions, ApprovalResponse } from '../../shared/superagent-types'

export function registerSuperagentHandlers(deps: IpcDependencies): void {
  const { superagentManager, approvalBroker } = deps

  ipcMain.handle('superagent:list', () => superagentManager.list())

  ipcMain.handle('superagent:create', async (_e, options: SuperagentCreateOptions) => {
    return superagentManager.create(options)
  })

  ipcMain.handle('superagent:kill', async (_e, id: string) => {
    await superagentManager.kill(id)
  })

  ipcMain.handle('superagent:toggle-auto-approve', (_e, id: string, value: boolean) => {
    superagentManager.setAutoApprove(id, value)
  })

  ipcMain.handle('superagent:approval-response', (_e, response: ApprovalResponse) => {
    approvalBroker.respond(response)
  })

  ipcMain.handle('superagent:list-pending-approvals', (_e, id: string) => {
    return approvalBroker.listPending(id)
  })
}
```

- [ ] **Step 3: Register handlers in central dispatcher**

In `src/main/app/ipc-handlers.ts`, import `registerSuperagentHandlers` and call it inside `registerIpcHandlers(deps)`, alongside the existing `registerAgentHandlers(deps)`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/superagent-handlers.ts src/main/ipc/types.ts src/main/app/ipc-handlers.ts
git commit -m "feat(superagent): register IPC handlers"
```

---

## Task 10: Preload allowlist

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add invoke + listen channels**

Edit `src/preload/index.ts`. Append to `ALLOWED_INVOKE_CHANNELS`:
```ts
  'superagent:list',
  'superagent:create',
  'superagent:kill',
  'superagent:toggle-auto-approve',
  'superagent:approval-response',
  'superagent:list-pending-approvals',
```
Append to `ALLOWED_LISTEN_CHANNELS`:
```ts
  'superagent:approval-request',
  'superagent:status',
  'superagent:child-spawned',
  'superagent:list-changed',
  'superagent:output',
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(superagent): whitelist superagent IPC channels"
```

---

## Task 11: Emit push events from main

The renderer needs `superagent:approval-request` (when a tool call is awaiting approval), `superagent:status` (status changes), `superagent:child-spawned` (so fleet view updates), `superagent:list-changed`, and `superagent:output` (orchestrator's own PTY output).

**Files:**
- Modify: `src/main/app/index.ts`
- Modify: `src/main/superagent/superagent-manager.ts`

- [ ] **Step 1: Wire approval broker emit → renderer**

In `src/main/app/index.ts`, when constructing `ApprovalBroker`, pass:
```ts
const approvalBroker = new ApprovalBroker({
  emit: (req) => mainWindow?.webContents.send('superagent:approval-request', req),
  onAutoApprove: (id) => superagentManager.setAutoApprove(id, true),
})
```
(Note: `superagentManager` is constructed after the broker; refactor by constructing the broker with a setter for `onAutoApprove` if a forward-reference is awkward.)

- [ ] **Step 2: Wire status + list-changed from `SuperagentManager`**

`SuperagentManager` already accepts `emitStatus`. Also accept `emitListChanged` in its deps and call it after `add`/`update`/`remove`:
```ts
emitListChanged: () => void
```
Invoke it at the end of `create()` and `kill()`.

In `app/index.ts`:
```ts
const superagentManager = new SuperagentManager({
  ...,
  emitStatus: (id, status) => mainWindow?.webContents.send('superagent:status', { superagentId: id, status }),
  emitListChanged: () => mainWindow?.webContents.send('superagent:list-changed'),
})
```

- [ ] **Step 3: Wire orchestrator output**

In `SuperagentManager.create`, replace the `onData` no-op with:
```ts
const unsubData = this.deps.ptyPool.onData(handle.id, (data) => {
  this.deps.emitOutput(id, data)
})
```
and add `emitOutput: (superagentId: string, chunk: string) => void` to the deps. Pass it from `app/index.ts` as `mainWindow?.webContents.send('superagent:output', { superagentId, chunk })`.

- [ ] **Step 4: Emit child-spawned**

In `OrchestratorMcpServer.spawnAgent`, after `createSession` returns, also notify via a callback added to `OrchestratorDeps`:
```ts
onChildSpawned: (sessionId: string) => void
```
Pass from `SuperagentManager.create` as:
```ts
onChildSpawned: (sid) => {
  this.deps.store.addChild(id, sid)
  this.deps.emitChildSpawned(id, sid)
}
```
And add `emitChildSpawned: (superagentId: string, sessionId: string) => void` to `SuperagentManagerDeps` / pipe from `app/index.ts`.

Update the `OrchestratorMcpServer` test to cover the new callback (one added assertion in the `spawn_agent approves, then calls createSession` test).

- [ ] **Step 5: Verify all tests**

Run: `npx vitest run src/main/superagent/`
Expected: all PASS (fix any failures caused by new required deps — update test factories).

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A src/main
git commit -m "feat(superagent): emit push events to renderer"
```

---

## Task 12: Renderer hook `useSuperagents`

**Files:**
- Create: `src/renderer/hooks/useSuperagents.ts`
- Test: `src/renderer/hooks/useSuperagents.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/hooks/useSuperagents.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSuperagents } from './useSuperagents'

const mockInvoke = vi.fn()
const listeners = new Map<string, (...args: any[]) => void>()
const mockOn = vi.fn((channel: string, fn: any) => {
  listeners.set(channel, fn)
  return () => listeners.delete(channel)
})

beforeEach(() => {
  listeners.clear()
  mockInvoke.mockReset()
  mockOn.mockClear()
  ;(window as any).electronAPI = { invoke: mockInvoke, send: vi.fn(), on: mockOn }
})

describe('useSuperagents', () => {
  it('fetches list on mount', async () => {
    mockInvoke.mockResolvedValueOnce([{ id: 's1', name: 'one' }])
    const { result } = renderHook(() => useSuperagents())
    await waitFor(() => expect(result.current.superagents).toHaveLength(1))
    expect(mockInvoke).toHaveBeenCalledWith('superagent:list')
  })

  it('refreshes when list-changed fires', async () => {
    mockInvoke.mockResolvedValueOnce([])
    const { result } = renderHook(() => useSuperagents())
    await waitFor(() => expect(result.current.superagents).toEqual([]))
    mockInvoke.mockResolvedValueOnce([{ id: 's1' }])
    act(() => { listeners.get('superagent:list-changed')?.() })
    await waitFor(() => expect(result.current.superagents).toHaveLength(1))
  })

  it('create invokes and returns the new superagent', async () => {
    mockInvoke.mockResolvedValueOnce([]) // initial list
    mockInvoke.mockResolvedValueOnce({ id: 's1', name: 'new' }) // create
    const { result } = renderHook(() => useSuperagents())
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('superagent:list'))
    let created: any
    await act(async () => {
      created = await result.current.createSuperagent({ name: 'new', taskDescription: '', fleetProjectIds: ['p1'], initialPrompt: '' })
    })
    expect(created.id).toBe('s1')
    expect(mockInvoke).toHaveBeenCalledWith('superagent:create', expect.any(Object))
  })
})
```

- [ ] **Step 2: Verify test fails**

Run: `npx vitest run src/renderer/hooks/useSuperagents.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement the hook**

Create `src/renderer/hooks/useSuperagents.ts`:
```ts
import { useCallback, useEffect, useState } from 'react'
import type { Superagent, SuperagentCreateOptions } from '../../shared/superagent-types'

export interface UseSuperagentsResult {
  superagents: Superagent[]
  createSuperagent: (opts: SuperagentCreateOptions) => Promise<Superagent>
  killSuperagent: (id: string) => Promise<void>
  toggleAutoApprove: (id: string, value: boolean) => Promise<void>
}

export function useSuperagents(): UseSuperagentsResult {
  const [superagents, setSuperagents] = useState<Superagent[]>([])

  const refresh = useCallback(async () => {
    const list = await window.electronAPI.invoke('superagent:list')
    setSuperagents(list as Superagent[])
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    const off = window.electronAPI.on('superagent:list-changed', () => { void refresh() })
    return off
  }, [refresh])

  const createSuperagent = useCallback(async (opts: SuperagentCreateOptions) => {
    const s = (await window.electronAPI.invoke('superagent:create', opts)) as Superagent
    await refresh()
    return s
  }, [refresh])

  const killSuperagent = useCallback(async (id: string) => {
    await window.electronAPI.invoke('superagent:kill', id)
    await refresh()
  }, [refresh])

  const toggleAutoApprove = useCallback(async (id: string, value: boolean) => {
    await window.electronAPI.invoke('superagent:toggle-auto-approve', id, value)
    await refresh()
  }, [refresh])

  return { superagents, createSuperagent, killSuperagent, toggleAutoApprove }
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run src/renderer/hooks/useSuperagents.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useSuperagents.ts src/renderer/hooks/useSuperagents.test.ts
git commit -m "feat(superagent): add useSuperagents hook"
```

---

## Task 13: Renderer hook `useApprovalInbox`

**Files:**
- Create: `src/renderer/hooks/useApprovalInbox.ts`
- Test: `src/renderer/hooks/useApprovalInbox.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/renderer/hooks/useApprovalInbox.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useApprovalInbox } from './useApprovalInbox'

const mockInvoke = vi.fn()
const listeners = new Map<string, (...args: any[]) => void>()
const mockOn = vi.fn((ch: string, fn: any) => { listeners.set(ch, fn); return () => listeners.delete(ch) })

beforeEach(() => {
  listeners.clear()
  mockInvoke.mockReset()
  ;(window as any).electronAPI = { invoke: mockInvoke, send: vi.fn(), on: mockOn }
})

describe('useApprovalInbox', () => {
  it('loads pending approvals on mount', async () => {
    mockInvoke.mockResolvedValueOnce([{ requestId: 'r1', superagentId: 's1', toolName: 'spawn_agent', args: {}, requestedAt: 1 }])
    const { result } = renderHook(() => useApprovalInbox('s1'))
    await waitFor(() => expect(result.current.pending).toHaveLength(1))
  })

  it('appends on approval-request for the same superagent', async () => {
    mockInvoke.mockResolvedValueOnce([])
    const { result } = renderHook(() => useApprovalInbox('s1'))
    await waitFor(() => expect(result.current.pending).toEqual([]))
    act(() => {
      listeners.get('superagent:approval-request')?.({ requestId: 'r2', superagentId: 's1', toolName: 'send_prompt', args: {}, requestedAt: 2 })
    })
    expect(result.current.pending).toHaveLength(1)
  })

  it('ignores approval-request for a different superagent', async () => {
    mockInvoke.mockResolvedValueOnce([])
    const { result } = renderHook(() => useApprovalInbox('s1'))
    await waitFor(() => expect(result.current.pending).toEqual([]))
    act(() => {
      listeners.get('superagent:approval-request')?.({ requestId: 'r3', superagentId: 'other', toolName: 'send_prompt', args: {}, requestedAt: 3 })
    })
    expect(result.current.pending).toHaveLength(0)
  })

  it('respond() invokes approval-response and removes the entry', async () => {
    mockInvoke.mockResolvedValueOnce([{ requestId: 'r1', superagentId: 's1', toolName: 'spawn_agent', args: {}, requestedAt: 1 }])
    const { result } = renderHook(() => useApprovalInbox('s1'))
    await waitFor(() => expect(result.current.pending).toHaveLength(1))
    mockInvoke.mockResolvedValueOnce(undefined)
    await act(async () => { await result.current.respond('r1', 'approve') })
    expect(mockInvoke).toHaveBeenCalledWith('superagent:approval-response', { requestId: 'r1', decision: 'approve' })
    expect(result.current.pending).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Verify test fails**

Run: `npx vitest run src/renderer/hooks/useApprovalInbox.test.ts`
Expected: FAIL — cannot find module

- [ ] **Step 3: Implement the hook**

Create `src/renderer/hooks/useApprovalInbox.ts`:
```ts
import { useCallback, useEffect, useState } from 'react'
import type { ApprovalRequest, ApprovalResponse } from '../../shared/superagent-types'

export interface UseApprovalInboxResult {
  pending: ApprovalRequest[]
  respond: (requestId: string, decision: ApprovalResponse['decision']) => Promise<void>
}

export function useApprovalInbox(superagentId: string): UseApprovalInboxResult {
  const [pending, setPending] = useState<ApprovalRequest[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const list = (await window.electronAPI.invoke('superagent:list-pending-approvals', superagentId)) as ApprovalRequest[]
      if (!cancelled) setPending(list)
    })()
    return () => { cancelled = true }
  }, [superagentId])

  useEffect(() => {
    const off = window.electronAPI.on('superagent:approval-request', (req: ApprovalRequest) => {
      if (req.superagentId !== superagentId) return
      setPending((prev) => [...prev, req])
    })
    return off
  }, [superagentId])

  const respond = useCallback(async (requestId: string, decision: ApprovalResponse['decision']) => {
    await window.electronAPI.invoke('superagent:approval-response', { requestId, decision })
    setPending((prev) => prev.filter((r) => r.requestId !== requestId))
  }, [])

  return { pending, respond }
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run src/renderer/hooks/useApprovalInbox.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useApprovalInbox.ts src/renderer/hooks/useApprovalInbox.test.ts
git commit -m "feat(superagent): add useApprovalInbox hook"
```

---

## Task 14: `NewSuperagentModal` component

**Files:**
- Create: `src/renderer/components/modals/NewSuperagentModal.tsx`
- Create: `src/renderer/components/modals/NewSuperagentModal.styles.ts`

- [ ] **Step 1: Create the styles module**

Create `src/renderer/components/modals/NewSuperagentModal.styles.ts`:
```ts
import type { CSSProperties } from 'react'

export const overlay: CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
}
export const modal: CSSProperties = {
  background: 'var(--color-surface-1)', borderRadius: 8, padding: 24,
  width: 560, maxHeight: '80vh', overflow: 'auto',
  border: '1px solid var(--color-border)',
}
export const title: CSSProperties = { margin: 0, marginBottom: 16, fontSize: 18, fontWeight: 600 }
export const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }
export const label: CSSProperties = { fontSize: 12, color: 'var(--color-text-muted)' }
export const input: CSSProperties = {
  background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
  borderRadius: 4, padding: '6px 8px', color: 'var(--color-text)',
}
export const fleetList: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4,
  maxHeight: 180, overflowY: 'auto',
  border: '1px solid var(--color-border)', borderRadius: 4, padding: 8,
}
export const fleetRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }
export const actions: CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }
export const primaryButton: CSSProperties = {
  background: 'var(--color-accent)', color: 'var(--color-accent-on)',
  border: 'none', borderRadius: 4, padding: '8px 16px', cursor: 'pointer',
}
export const secondaryButton: CSSProperties = {
  background: 'transparent', color: 'var(--color-text)',
  border: '1px solid var(--color-border)', borderRadius: 4, padding: '8px 16px', cursor: 'pointer',
}
```

- [ ] **Step 2: Create the component**

Create `src/renderer/components/modals/NewSuperagentModal.tsx`:
```tsx
import { useState } from 'react'
import type { Project } from '../../../shared/types'
import type { SuperagentCreateOptions } from '../../../shared/superagent-types'
import * as s from './NewSuperagentModal.styles'

export interface NewSuperagentModalProps {
  visible: boolean
  projects: Project[]
  onLaunch: (options: SuperagentCreateOptions) => void
  onClose: () => void
}

export function NewSuperagentModal({ visible, projects, onLaunch, onClose }: NewSuperagentModalProps) {
  const [name, setName] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [initialPrompt, setInitialPrompt] = useState('')
  const [fleet, setFleet] = useState<string[]>(projects.map((p) => p.id))

  if (!visible) return null

  const canSubmit = name.trim().length > 0 && taskDescription.trim().length > 0 && fleet.length > 0

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={s.title}>New Superagent</h2>

        <div style={s.field}>
          <label style={s.label}>Name</label>
          <input style={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. cross-repo auth rename" />
        </div>

        <div style={s.field}>
          <label style={s.label}>Task description</label>
          <textarea style={{ ...s.input, minHeight: 60, fontFamily: 'inherit' }} value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} />
        </div>

        <div style={s.field}>
          <label style={s.label}>Runtime</label>
          <input style={{ ...s.input, opacity: 0.7 }} value="Claude Code" readOnly />
        </div>

        <div style={s.field}>
          <label style={s.label}>Fleet ({fleet.length}/{projects.length})</label>
          <div style={s.fleetList}>
            {projects.map((p) => (
              <label key={p.id} style={s.fleetRow}>
                <input
                  type="checkbox"
                  checked={fleet.includes(p.id)}
                  onChange={(e) =>
                    setFleet((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)))
                  }
                />
                <span>{p.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={s.field}>
          <label style={s.label}>Initial prompt</label>
          <textarea style={{ ...s.input, minHeight: 80, fontFamily: 'inherit' }} value={initialPrompt} onChange={(e) => setInitialPrompt(e.target.value)} placeholder="What should the orchestrator do first?" />
        </div>

        <div style={s.actions}>
          <button style={s.secondaryButton} onClick={onClose}>Cancel</button>
          <button
            style={{ ...s.primaryButton, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
            disabled={!canSubmit}
            onClick={() => onLaunch({ name, taskDescription, fleetProjectIds: fleet, initialPrompt })}
          >
            Launch
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/modals/NewSuperagentModal.tsx src/renderer/components/modals/NewSuperagentModal.styles.ts
git commit -m "feat(superagent): add NewSuperagentModal"
```

---

## Task 15: Creation entry point — split button

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/modals/NewAgentPopover.tsx` (or introduce a small wrapper)

- [ ] **Step 1: Read the current "New Agent" wiring**

Open `src/renderer/App.tsx` and find where `NewAgentPopover` is rendered and where `onNewAgent` is defined (search `NewAgentPopover` / `onNewAgent`). Note the existing state variable(s) controlling the popover visibility.

- [ ] **Step 2: Add superagent popover state**

In `App.tsx`, add state for the new superagent modal:
```tsx
const [newSuperagentVisible, setNewSuperagentVisible] = useState(false)
const { superagents, createSuperagent } = useSuperagents()
```

- [ ] **Step 3: Add a "New Superagent" button next to "New Agent"**

In the header area where "New Agent" is rendered (find it via the `onNewAgent` prop on the sidebar/header), add a sibling button:
```tsx
<button
  style={{ /* match existing secondary button */ }}
  onClick={() => setNewSuperagentVisible(true)}
  title="Create a cross-repo orchestrator session"
>
  + Superagent
</button>
```

Render the modal at the App level:
```tsx
<NewSuperagentModal
  visible={newSuperagentVisible}
  projects={projects}
  onLaunch={async (opts) => {
    const s = await createSuperagent(opts)
    setActiveSuperagentId(s.id)
    setNewSuperagentVisible(false)
  }}
  onClose={() => setNewSuperagentVisible(false)}
/>
```

Add `const [activeSuperagentId, setActiveSuperagentId] = useState<string | null>(null)`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Manual dev check**

Run: `npm run dev`
In the app: click "+ Superagent" → modal opens → pick a project → click "Launch" → no error in console. Terminate and reopen; superagent persists across restarts.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(superagent): add 'New Superagent' creation entry point"
```

---

## Task 16: `SuperagentView` — orchestrator terminal + fleet pane

**Files:**
- Create: `src/renderer/components/superagent/SuperagentView.tsx`
- Create: `src/renderer/components/superagent/SuperagentView.styles.ts`
- Create: `src/renderer/components/superagent/FleetPanel.tsx`
- Create: `src/renderer/components/superagent/FleetPanel.styles.ts`
- Create: `src/renderer/components/superagent/ChildAgentCard.tsx`

- [ ] **Step 1: Build styles**

Create `src/renderer/components/superagent/SuperagentView.styles.ts`:
```ts
import type { CSSProperties } from 'react'
export const root: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr auto', height: '100%', gap: 1, background: 'var(--color-border)' }
export const pane: CSSProperties = { background: 'var(--color-surface-0)', overflow: 'hidden' }
export const bottomStrip: CSSProperties = { gridColumn: '1 / span 2', background: 'var(--color-surface-1)', borderTop: '1px solid var(--color-border)' }
export const terminalHost: CSSProperties = { height: '100%', width: '100%' }
```

Create `src/renderer/components/superagent/FleetPanel.styles.ts`:
```ts
import type { CSSProperties } from 'react'
export const root: CSSProperties = { height: '100%', display: 'flex', flexDirection: 'column', padding: 8, gap: 8, overflowY: 'auto' }
export const header: CSSProperties = { fontSize: 12, color: 'var(--color-text-muted)' }
export const empty: CSSProperties = { padding: 16, color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center' }
export const card: CSSProperties = { background: 'var(--color-surface-1)', border: '1px solid var(--color-border)', borderRadius: 6, padding: 8 }
export const cardHeader: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }
export const statusChip: CSSProperties = { fontSize: 11, padding: '2px 6px', borderRadius: 10, background: 'var(--color-surface-2)' }
export const outputTail: CSSProperties = { fontFamily: 'var(--terminal-font-family)', fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap', marginTop: 6, maxHeight: 80, overflow: 'hidden' }
```

- [ ] **Step 2: Build `ChildAgentCard`**

Create `src/renderer/components/superagent/ChildAgentCard.tsx`:
```tsx
import type { AgentSession } from '../../../shared/types'
import * as s from './FleetPanel.styles'

export function ChildAgentCard({ session, outputTail, projectName }: { session: AgentSession; outputTail: string; projectName: string }) {
  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <strong>{projectName}</strong>
        <span style={s.statusChip}>{session.status}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{session.branchName}</div>
      {outputTail && <pre style={s.outputTail}>{outputTail}</pre>}
    </div>
  )
}
```

- [ ] **Step 3: Build `FleetPanel`**

Create `src/renderer/components/superagent/FleetPanel.tsx`:
```tsx
import type { AgentSession, Project } from '../../../shared/types'
import type { Superagent } from '../../../shared/superagent-types'
import { ChildAgentCard } from './ChildAgentCard'
import * as s from './FleetPanel.styles'

export interface FleetPanelProps {
  superagent: Superagent
  childSessions: AgentSession[]
  projects: Project[]
  outputTails: Record<string, string>
}

export function FleetPanel({ superagent, childSessions, projects, outputTails }: FleetPanelProps) {
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id
  return (
    <div style={s.root}>
      <div style={s.header}>Fleet: {superagent.fleetProjectIds.map(projectName).join(' · ')}</div>
      {childSessions.length === 0 ? (
        <div style={s.empty}>No children yet.<br />The orchestrator will request to spawn agents as it plans.</div>
      ) : (
        childSessions.map((sess) => (
          <ChildAgentCard
            key={sess.id}
            session={sess}
            projectName={projectName(sess.projectId)}
            outputTail={outputTails[sess.id] ?? ''}
          />
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 4: Build `SuperagentView`**

Create `src/renderer/components/superagent/SuperagentView.tsx`:
```tsx
import { useEffect, useMemo, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import type { AgentSession, Project } from '../../../shared/types'
import type { Superagent } from '../../../shared/superagent-types'
import { FleetPanel } from './FleetPanel'
import { ApprovalInbox } from './ApprovalInbox'
import * as s from './SuperagentView.styles'

export interface SuperagentViewProps {
  superagent: Superagent
  projects: Project[]
  childSessions: AgentSession[]
  childOutputTails: Record<string, string>
}

export function SuperagentView({ superagent, projects, childSessions, childOutputTails }: SuperagentViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)

  useEffect(() => {
    if (!hostRef.current) return
    const term = new Terminal({ convertEol: true })
    term.open(hostRef.current)
    termRef.current = term
    const off = window.electronAPI.on('superagent:output', (msg: { superagentId: string; chunk: string }) => {
      if (msg.superagentId !== superagent.id) return
      term.write(msg.chunk)
    })
    return () => { off(); term.dispose() }
  }, [superagent.id])

  const childIds = useMemo(() => childSessions.map((c) => c.id), [childSessions])

  return (
    <div style={s.root}>
      <div style={s.pane}><div ref={hostRef} style={s.terminalHost} /></div>
      <div style={s.pane}>
        <FleetPanel
          superagent={superagent}
          childSessions={childSessions}
          projects={projects}
          outputTails={childOutputTails}
        />
      </div>
      <div style={s.bottomStrip}>
        <ApprovalInbox superagentId={superagent.id} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/superagent/
git commit -m "feat(superagent): add SuperagentView with orchestrator terminal + fleet panel"
```

---

## Task 17: `ApprovalInbox` component

**Files:**
- Create: `src/renderer/components/superagent/ApprovalInbox.tsx`
- Create: `src/renderer/components/superagent/ApprovalInbox.styles.ts`

- [ ] **Step 1: Build styles**

Create `src/renderer/components/superagent/ApprovalInbox.styles.ts`:
```ts
import type { CSSProperties } from 'react'
export const root: CSSProperties = { display: 'flex', flexDirection: 'column', padding: 8, gap: 6 }
export const empty: CSSProperties = { color: 'var(--color-text-muted)', fontSize: 11, padding: 4 }
export const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--color-surface-2)', borderRadius: 4 }
export const toolName: CSSProperties = { fontWeight: 600, fontSize: 12 }
export const args: CSSProperties = { flex: 1, fontFamily: 'var(--terminal-font-family)', fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
export const approve: CSSProperties = { background: 'var(--color-accent)', color: 'var(--color-accent-on)', border: 'none', borderRadius: 3, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }
export const deny: CSSProperties = { background: 'transparent', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 3, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }
export const approveAll: CSSProperties = { ...deny, marginLeft: 4 }
```

- [ ] **Step 2: Build the component**

Create `src/renderer/components/superagent/ApprovalInbox.tsx`:
```tsx
import { useApprovalInbox } from '../../hooks/useApprovalInbox'
import * as s from './ApprovalInbox.styles'

export function ApprovalInbox({ superagentId }: { superagentId: string }) {
  const { pending, respond } = useApprovalInbox(superagentId)
  if (pending.length === 0) {
    return <div style={s.root}><div style={s.empty}>No pending approvals.</div></div>
  }
  return (
    <div style={s.root}>
      {pending.map((req) => (
        <div key={req.requestId} style={s.row}>
          <span style={s.toolName}>{req.toolName}</span>
          <span style={s.args}>{JSON.stringify(req.args)}</span>
          <button style={s.approve} onClick={() => respond(req.requestId, 'approve')}>Approve</button>
          <button style={s.deny} onClick={() => respond(req.requestId, 'deny')}>Deny</button>
          <button style={s.approveAll} onClick={() => respond(req.requestId, 'approve-all')}>Approve all</button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/superagent/ApprovalInbox.tsx src/renderer/components/superagent/ApprovalInbox.styles.ts
git commit -m "feat(superagent): add ApprovalInbox component"
```

---

## Task 18: Route App.tsx to `SuperagentView` when a superagent is active

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Branch rendering**

In `App.tsx`, where the main content area is rendered (the non-sidebar region), add:
```tsx
const activeSuperagent = superagents.find((s) => s.id === activeSuperagentId)
const childSessions = allProjectSessions.filter((sess) => sess.parentSuperagentId === activeSuperagentId)

{activeSuperagent ? (
  <SuperagentView
    superagent={activeSuperagent}
    projects={projects}
    childSessions={childSessions}
    childOutputTails={childOutputTails}
  />
) : (
  /* existing project-tab content */
)}
```

Where `childOutputTails: Record<string, string>` is derived from whatever existing hook holds per-session output (likely the same source that `MainPanes` already uses for its terminal). For v1 a simple approach: read the last 5 lines of each session's buffered output from `agent:replay` (an existing IPC channel, per the exploration report). Kept out of this task for brevity — acceptable to pass `{}` initially and populate it in a follow-up task.

Set `activeSuperagentId` to `null` when a project tab is chosen, and when a superagent is chosen clear `activeProjectId`. Hook this into the sidebar click handlers added in Task 19.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(superagent): render SuperagentView when a superagent tab is active"
```

---

## Task 19: Sidebar — `SuperagentList`

**Files:**
- Create: `src/renderer/components/sidebar/SuperagentList.tsx`
- Modify: `src/renderer/components/sidebar/ProjectSidebar.tsx`

- [ ] **Step 1: Create the list**

Create `src/renderer/components/sidebar/SuperagentList.tsx`:
```tsx
import type { Superagent } from '../../../shared/superagent-types'

export function SuperagentList({
  superagents,
  activeSuperagentId,
  onSelect,
}: {
  superagents: Superagent[]
  activeSuperagentId: string | null
  onSelect: (id: string) => void
}) {
  if (superagents.length === 0) return null
  return (
    <div style={{ padding: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        Superagents
      </div>
      {superagents.map((s) => (
        <div
          key={s.id}
          onClick={() => onSelect(s.id)}
          style={{
            padding: '6px 8px',
            cursor: 'pointer',
            borderRadius: 4,
            background: s.id === activeSuperagentId ? 'var(--color-surface-2)' : 'transparent',
          }}
        >
          <div style={{ fontSize: 13 }}>{s.name}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {s.fleetProjectIds.length} repos · {s.status}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Mount it in `ProjectSidebar`**

Extend `ProjectSidebarProps` to include:
```ts
superagents: Superagent[]
activeSuperagentId: string | null
onSelectSuperagent: (id: string) => void
```

Render `<SuperagentList superagents={superagents} activeSuperagentId={activeSuperagentId} onSelect={onSelectSuperagent} />` above the project list.

In `App.tsx`, pass the values through from `useSuperagents()` and the `activeSuperagentId` state.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/sidebar/SuperagentList.tsx src/renderer/components/sidebar/ProjectSidebar.tsx src/renderer/App.tsx
git commit -m "feat(superagent): add Superagents section in sidebar"
```

---

## Task 20: Derived superagent status from children

**Files:**
- Modify: `src/main/superagent/superagent-manager.ts`
- Modify: `src/main/superagent/superagent-manager.test.ts`

- [ ] **Step 1: Add failing test**

Append to `superagent-manager.test.ts`:
```ts
describe('SuperagentManager — derived status', () => {
  it('recomputes status to running when any child is running', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-mgr-'))
    deps = makeDeps(tmpDir)
    manager = new SuperagentManager(deps)
    const s = await manager.create({ name: 'n', taskDescription: 'd', fleetProjectIds: ['p1'], initialPrompt: 'x' })
    deps.sessionManager.getSession = vi.fn((id: string) => ({ id, status: 'running', parentSuperagentId: s.id }) as any)
    manager.onChildStatusChange(s.id, 'c1', 'running')
    expect(deps.store.get(s.id)?.status).toBe('running')
  })

  it('marks superagent done when all children done', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-mgr-'))
    deps = makeDeps(tmpDir)
    manager = new SuperagentManager(deps)
    const s = await manager.create({ name: 'n', taskDescription: 'd', fleetProjectIds: ['p1'], initialPrompt: 'x' })
    // Manually inject two children
    deps.store.update(s.id, { childSessionIds: ['c1', 'c2'] })
    deps.sessionManager.getSession = vi.fn((id: string) => ({ id, status: 'done', parentSuperagentId: s.id }) as any)
    manager.onChildStatusChange(s.id, 'c1', 'done')
    expect(deps.store.get(s.id)?.status).toBe('done')
  })

  it('marks superagent error when any child errors', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-mgr-'))
    deps = makeDeps(tmpDir)
    manager = new SuperagentManager(deps)
    const s = await manager.create({ name: 'n', taskDescription: 'd', fleetProjectIds: ['p1'], initialPrompt: 'x' })
    deps.store.update(s.id, { childSessionIds: ['c1'] })
    deps.sessionManager.getSession = vi.fn(() => ({ id: 'c1', status: 'error', parentSuperagentId: s.id }) as any)
    manager.onChildStatusChange(s.id, 'c1', 'error')
    expect(deps.store.get(s.id)?.status).toBe('error')
  })
})
```

- [ ] **Step 2: Implement `onChildStatusChange`**

In `superagent-manager.ts`, add:
```ts
onChildStatusChange(superagentId: string, _childId: string, _childStatus: AgentStatus): void {
  const s = this.deps.store.get(superagentId)
  if (!s) return
  const childStatuses = s.childSessionIds
    .map((id) => this.deps.sessionManager.getSession(id)?.status)
    .filter((v): v is AgentStatus => Boolean(v))

  let status: AgentStatus = 'waiting'
  if (childStatuses.some((st) => st === 'error')) status = 'error'
  else if (childStatuses.some((st) => st === 'running')) status = 'running'
  else if (childStatuses.length > 0 && childStatuses.every((st) => st === 'done')) status = 'done'
  else status = 'waiting'

  this.deps.store.update(superagentId, { status })
  this.deps.emitStatus(superagentId, status)
}
```

Hook it up in `app/index.ts`: subscribe to the existing `agent:status` emitter (whatever the main process uses internally) — when a session with `parentSuperagentId` changes status, call `superagentManager.onChildStatusChange(parentSuperagentId, sessionId, newStatus)`.

Concretely, find where `sessionManager.createSession` / the stream wirer emits session status (search for `'agent:status'` in `src/main/`) and add the forwarder.

- [ ] **Step 3: Verify tests pass**

Run: `npx vitest run src/main/superagent/superagent-manager.test.ts`
Expected: all PASS (original 5 + 3 new).

- [ ] **Step 4: Commit**

```bash
git add src/main/superagent/superagent-manager.ts src/main/superagent/superagent-manager.test.ts src/main/app/index.ts
git commit -m "feat(superagent): derive superagent status from children"
```

---

## Task 21: End-to-end smoke in dev mode

- [ ] **Step 1: Run full test suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: PASS

- [ ] **Step 2: Run in dev mode**

Run: `npm run dev`

Verify the following flow manually:
1. App opens; Superagents section in sidebar is empty.
2. Click "+ Superagent" → modal opens with projects checked.
3. Name it "smoke test", enter a task like "List files in each repo", keep all projects in fleet, enter initial prompt "list files in each".
4. Click Launch.
5. Superagent appears in sidebar under Superagents; click it.
6. Orchestrator terminal shows Claude Code running with the initial prompt.
7. Orchestrator calls `list_projects` — verify by typing in terminal or checking debug log.
8. Orchestrator calls `spawn_agent` — approval request appears in the bottom strip.
9. Click Approve; child card appears in the right pane.
10. Stop the superagent via sidebar; status flips to `done`.
11. Quit and reopen the app; superagent still listed with status `done`.
12. Remove the superagent's record by deleting `~/.manifold/superagents.json`; it disappears on next app start.

- [ ] **Step 3: Fix anything that broke**

If step 7 or 8 doesn't fire, check:
- `~/.manifold/debug.log` for MCP bridge errors
- whether `claude --mcp-config` flag name is correct — run `claude --help | grep -i mcp` to confirm; adjust `SuperagentManager.create` args accordingly.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(superagent): smoke-test adjustments"
```

- [ ] **Step 5: Final commit + PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: superagent — cross-repo orchestrator sessions" --body "$(cat <<'EOF'
## Summary
- Adds a new "superagent" session type: a Claude Code orchestrator that spawns and controls child agents across multiple repos via a local MCP server (7 tools).
- Every mutating tool call is gated by a renderer-side approval (with session-scoped auto-approve).
- New sidebar section; new two-pane layout with orchestrator terminal + fleet view + approval inbox.

## Test plan
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] Dev mode smoke test walks through the 12 steps in the plan

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review (already run — results)

1. **Spec coverage.** Every spec section maps to tasks: session model → T1; storage → T2; runtime → T7; tool interface + approval → T3/T5/T6/T8; IPC + preload → T9/T10/T11; creation flow → T14/T15; layout → T16; approval inbox → T17; sidebar → T19; status model → T20; smoke test → T21. Non-goals held (no prompt broadcaster, no multi-runtime superagent).

2. **Placeholders.** None left. `emitOutput`, `emitStatus`, `emitListChanged`, `emitChildSpawned`, `onChildSpawned`, and the child-output-tails derivation are all explicit, not "TBD". The `--mcp-config` flag name is flagged as "verify via `claude --help`" — not a placeholder, a verification step.

3. **Type consistency.** `ApprovalToolName` used identically in `Superagent` types, `ApprovalBroker`, and `OrchestratorMcpServer`. `SpawnAgentOptions.parentSuperagentId` added in T1 and consumed in T6 and flows through `SessionManager`. `SuperagentManagerDeps` accumulates new emit callbacks across tasks — each addition is spelled out where it's introduced (T11, T20).

4. **Scope.** 21 tasks, ~4 days of work for one engineer. Could be split at T15 (everything up to T15 is a working main-process + hooks layer; T16–T21 is UI), but not necessary — one plan.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-18-superagent.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
