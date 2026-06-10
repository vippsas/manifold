// src/plugin-host/agents-api.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createAgentsApi } from './agents-api'
import { CapabilityError } from './gated-api'
import type { Capability } from '../shared/plugins/manifest'

function makeEndpoint(): { proxy: Record<string, ReturnType<typeof vi.fn>>; endpoint: { getProxy: () => unknown } } {
  const proxy = {
    $runTurn: vi.fn(async () => 'ended'),
    $cancelTurn: vi.fn(async () => undefined),
    $spawnSibling: vi.fn(async () => ({ sessionId: 'sib-1' })),
    $sendText: vi.fn(async () => undefined),
    $whenReady: vi.fn(async () => true),
    $getStatus: vi.fn(async () => 'waiting'),
    $kill: vi.fn(async () => undefined),
    $reveal: vi.fn(async () => undefined),
  }
  return { proxy, endpoint: { getProxy: () => proxy } }
}

const workspace = { activeSessionId: 'active-1' }

function api(caps: Capability[], pluginId = 'manifold.watch'): { proxy: Record<string, ReturnType<typeof vi.fn>>; agents: ReturnType<typeof createAgentsApi> } {
  const { proxy, endpoint } = makeEndpoint()
  return { proxy, agents: createAgentsApi(endpoint as never, workspace as never, pluginId, new Set(caps)) }
}

describe('createAgentsApi capability split', () => {
  it('spawnSibling threads pluginId and returns a full AgentSession', async () => {
    const { proxy, agents } = api(['agent:spawn'])
    const agent = await agents.spawnSibling('base-1', { title: 'T', groupId: 'g' })
    expect(proxy.$spawnSibling).toHaveBeenCalledWith('manifold.watch', 'base-1', { title: 'T', groupId: 'g' })
    expect(agent.sessionId).toBe('sib-1')
    await agent.sendText('hello')
    expect(proxy.$sendText).toHaveBeenCalledWith('manifold.watch', 'sib-1', 'hello')
    await expect(agent.whenReady(5_000)).resolves.toBe(true)
    expect(proxy.$whenReady).toHaveBeenCalledWith('manifold.watch', 'sib-1', 5_000)
    await expect(agent.getStatus()).resolves.toBe('waiting')
    await agent.reveal('Title')
    expect(proxy.$reveal).toHaveBeenCalledWith('manifold.watch', 'sib-1', 'Title')
    await agent.kill()
    expect(proxy.$kill).toHaveBeenCalledWith('manifold.watch', 'sib-1')
  })

  it('spawnSibling throws CapabilityError without agent:spawn', async () => {
    const { agents } = api(['agent:control'], 'manifold.loop')
    await expect(agents.spawnSibling('base-1')).rejects.toThrow(CapabilityError)
  })

  it('runTurn throws CapabilityError without agent:control', async () => {
    const { agents } = api(['agent:spawn'])
    const agent = agents.getAgent('s-1')
    expect(agent).toBeDefined()
    await expect(agent!.runTurn('hi')).rejects.toThrow(CapabilityError)
  })

  it('runTurn still works with agent:control (regression)', async () => {
    const { proxy, agents } = api(['agent:control'], 'manifold.loop')
    const agent = agents.getAgent('s-1')
    await expect(agent!.runTurn('hi')).resolves.toBe('ended')
    expect(proxy.$runTurn).toHaveBeenCalledWith('manifold.loop', 's-1', 'hi', undefined)
  })

  it('sendText throws CapabilityError without agent:spawn', async () => {
    const { agents } = api(['agent:control'], 'manifold.loop')
    const agent = agents.getAgent('s-1')
    await expect(agent!.sendText('x')).rejects.toThrow(CapabilityError)
  })
})
