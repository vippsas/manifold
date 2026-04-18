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
      getOutputBuffer: vi.fn(() => ''),
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
    deps.sessionManager.getOutputBuffer = vi.fn(() => 'hello world')
    const result = await server.handleToolCall('read_output', { sessionId: 'c1' })
    expect(result).toEqual({ text: 'hello world' })
  })

  it('read_diff returns the session diff', async () => {
    deps.sessionManager.getSession = vi.fn(() => ({ id: 'c1', parentSuperagentId: 'super-1', projectId: 'p1', worktreePath: '/w' }) as any)
    const result = await server.handleToolCall('read_diff', { sessionId: 'c1' })
    expect(result).toEqual({ diff: 'diff output' })
  })

  it('unknown tool throws', async () => {
    await expect(server.handleToolCall('bogus', {})).rejects.toThrow(/unknown tool/i)
  })
})

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
