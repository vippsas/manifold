import { describe, expect, it, vi } from 'vitest'
import { ChatAdapter } from '../agent/chat-adapter'
import { ViolaHarness } from './harness'
import { MemoryViolaStore } from './store'

describe('ViolaHarness', () => {
  it('turns the first normal chat message into a gated plan under the Viola identity', async () => {
    const statuses: string[] = []
    const sessions = {
      getSession: vi.fn(() => ({
        id: 'viola-1',
        projectId: 'project-1',
        runtimeId: 'viola',
        worktreePath: '/wt/base',
      })),
      getInternalSession: vi.fn(),
      setHarnessStatus: vi.fn((_sessionId: string, status: string) => statuses.push(status)),
      interruptSession: vi.fn(),
    }
    const chat = new ChatAdapter()
    const aiGenerate = vi.fn(async () => JSON.stringify({
      summary: 'One scoped change',
      tasks: [{
        title: 'Validation',
        description: 'Add request validation.',
        acceptance: ['Invalid requests are rejected'],
      }],
    }))
    const spawnService = {
      spawnSibling: vi.fn(),
      spawnAgent: vi.fn(),
      sendText: vi.fn(),
      whenReady: vi.fn(),
      getStatus: vi.fn(),
      kill: vi.fn(),
    }
    const harness = new ViolaHarness(
      sessions as never,
      chat,
      { aiGenerate } as never,
      {
        storageRoot: '/tmp',
        getPreferredRuntime: () => 'codex',
        listRuntimes: async () => [
          { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
          { id: 'codex', name: 'Codex', binary: 'codex', installed: true },
        ],
        spawnService: spawnService as never,
        controlService: { runTurn: vi.fn(), cancelTurn: vi.fn() } as never,
        store: new MemoryViolaStore(),
      },
    )

    harness.send('viola-1', 'Add validation')

    await vi.waitFor(() => expect(chat.getMessages('viola-1')).toHaveLength(1))
    expect(aiGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'codex' }),
      expect.stringContaining('Viola itself does not write code'),
      '/wt/base',
      [],
      expect.objectContaining({ silent: true }),
    )
    expect(chat.getMessages('viola-1')[0]).toMatchObject({
      role: 'agent',
      options: ['Start plan', 'Revise plan'],
    })
    expect(chat.getMessages('viola-1')[0].text).toContain('No worker has started')
    expect(spawnService.spawnAgent).not.toHaveBeenCalled()
    expect(statuses).toEqual(['running', 'waiting'])
  })
})
