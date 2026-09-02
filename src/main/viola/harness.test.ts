import { describe, expect, it, vi } from 'vitest'
import { ChatAdapter } from '../agent/chat-adapter'
import { ViolaHarness } from './harness'
import { MemoryViolaStore } from './store'

const PLAN_JSON = JSON.stringify({
  summary: 'One scoped change',
  tasks: [{
    title: 'Validation',
    description: 'Add request validation.',
    acceptance: ['Invalid requests are rejected'],
    gates: ['npm test -- src/validation'],
  }],
})

function setup(options: { preferredRuntime?: string; planResponse?: string; projectKind?: 'git' | 'folder' } = {}) {
  const statuses: string[] = []
  const sent: { channel: string; payload: unknown }[] = []
  const sessions = {
    getSession: vi.fn((id: string) => (id === 'viola-1' ? {
      id: 'viola-1',
      projectId: 'project-1',
      runtimeId: 'viola',
      worktreePath: '/wt/base',
    } : undefined)),
    getInternalSession: vi.fn(),
    setHarnessStatus: vi.fn((_sessionId: string, status: string) => statuses.push(status)),
    interruptSession: vi.fn(),
  }
  const chat = new ChatAdapter()
  const aiGenerate = vi.fn(async () => options.planResponse ?? PLAN_JSON)
  let child = 0
  const spawnService = {
    spawnSibling: vi.fn(),
    spawnAgent: vi.fn(async (_base: string, opts: { runtimeId: string; title: string }) => {
      const sessionId = `${opts.title}-${++child}`
      return { sessionId, runtimeId: opts.runtimeId, worktreePath: `/wt/${sessionId}` }
    }),
    sendText: vi.fn(),
    whenReady: vi.fn(async () => true),
    getStatus: vi.fn(),
    kill: vi.fn(),
  }
  const controlService = {
    runTurn: vi.fn(async (sessionId: string, prompt: string) => {
      chat.addAgentMessage(
        sessionId,
        prompt.startsWith('You are an independent code reviewer')
          ? '{"passed":true,"blocking":[],"nonBlocking":["Consider a shared helper."]}'
          : 'Added the validator and ran the gate.',
      )
      return 'ended' as const
    }),
    cancelTurn: vi.fn(),
  }
  const git = {
    head: vi.fn(async () => 'base-sha'),
    diff: vi.fn(async () => 'diff --git a/v b/v'),
    diffStat: vi.fn(async () => ' v | 1 +'),
    apply: vi.fn(async () => undefined),
    pullRequestUrl: vi.fn(async () => 'https://example.test/pr/1'),
  }
  const gates = { run: vi.fn(async () => ({ ok: true, output: '1 passed' })) }
  const harness = new ViolaHarness(
    sessions as never,
    chat,
    { aiGenerate } as never,
    {
      storageRoot: '/tmp',
      getPreferredRuntime: () => options.preferredRuntime ?? 'codex',
      getProject: () => ({ kind: options.projectKind ?? 'git' }),
      sendToRenderer: (channel, payload) => sent.push({ channel, payload }),
      listRuntimes: async () => [
        { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
        { id: 'codex', name: 'Codex', binary: 'codex', installed: true },
      ],
      spawnService: spawnService as never,
      controlService: controlService as never,
      store: new MemoryViolaStore(),
      git,
      gates,
    },
  )
  return { harness, chat, aiGenerate, spawnService, controlService, git, gates, statuses, sent }
}

function texts(chat: ChatAdapter, sessionId: string): string[] {
  return chat.getMessages(sessionId).map((message) => message.text)
}

describe('ViolaHarness', () => {
  it('turns the first normal chat message into a gated plan under the Viola identity', async () => {
    const { harness, chat, aiGenerate, spawnService, statuses } = setup()

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

  it('tells the user to re-add a plain-folder project instead of planning work it cannot isolate', async () => {
    const { harness, chat, aiGenerate } = setup({ projectKind: 'folder' })

    harness.send('viola-1', 'Add validation')

    await vi.waitFor(() => expect(chat.getMessages('viola-1')).toHaveLength(1))
    expect(chat.getMessages('viola-1')[0].text).toMatch(/isolated worktree/i)
    expect(chat.getMessages('viola-1')[0].text).toMatch(/git project/i)
    expect(aiGenerate).not.toHaveBeenCalled()
  })

  it('plans on the brain\'s default model with a budget that allows reading the repo', async () => {
    const { harness, chat, aiGenerate } = setup({ preferredRuntime: 'claude' })

    harness.send('viola-1', 'Add validation')

    await vi.waitFor(() => expect(chat.getMessages('viola-1')).toHaveLength(1))
    expect(aiGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'claude' }),
      expect.any(String),
      '/wt/base',
      [],
      expect.objectContaining({ timeoutMs: 600_000 }),
    )
  })

  it('streams every task step to the run board and keeps only milestones in the chat log', async () => {
    const { harness, chat, spawnService, git, gates, sent } = setup()
    harness.send('viola-1', 'Add validation')
    await vi.waitFor(() => expect(chat.getMessages('viola-1')).toHaveLength(1))

    harness.send('viola-1', 'Start plan')

    await vi.waitFor(() => expect(texts(chat, 'viola-1').at(-1)).toContain('## Run complete'))

    // The board sees the whole sequence, including states that never reach the chat.
    const boardStates = sent
      .filter((event) => event.channel === 'viola:run')
      .map((event) => (event.payload as { run: { tasks: { state: string }[] } }).run.tasks[0].state)
    expect(new Set(boardStates)).toEqual(new Set(['planned', 'spawning', 'implementing', 'gating', 'reviewing', 'done']))
    for (const event of sent) {
      expect(event.payload).toMatchObject({ sessionId: 'viola-1' })
    }

    // The chat log keeps the start line, the milestone, and the summary — not every transition.
    const lines = texts(chat, 'viola-1')
    expect(lines.some((line) => /implementing on claude/.test(line))).toBe(false)
    expect(lines.some((line) => /running gates/.test(line))).toBe(false)
    expect(lines.some((line) => /\*\*Validation\*\* · done/.test(line))).toBe(true)
    expect(lines.at(-1)).toContain('https://example.test/pr/1')

    expect(spawnService.spawnAgent).toHaveBeenCalledWith('viola-1', expect.objectContaining({
      title: 'Validation', runtimeId: 'claude', newWorktree: true, nonInteractive: true,
    }))
    expect(gates.run).toHaveBeenCalledWith('/wt/Validation-1', 'npm test -- src/validation', expect.anything())
    expect(git.apply).toHaveBeenCalledWith('/wt/review-validation-2', 'diff --git a/v b/v')
  })

  it('reports an explore task\'s answer in the summary', async () => {
    const { harness, chat } = setup({
      planResponse: JSON.stringify({
        summary: 'Investigate',
        tasks: [{ title: 'Why flaky', description: 'Why does the test flake?', acceptance: ['Cause named'], purpose: 'explore' }],
      }),
    })
    harness.send('viola-1', 'Why does the test flake?')
    await vi.waitFor(() => expect(chat.getMessages('viola-1')).toHaveLength(1))

    harness.send('viola-1', 'Start plan')

    await vi.waitFor(() => expect(texts(chat, 'viola-1').at(-1)).toContain('## Run complete'))
    expect(texts(chat, 'viola-1').at(-1)).toContain('Added the validator and ran the gate.')
  })
})
