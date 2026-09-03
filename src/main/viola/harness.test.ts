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

function setup(options: {
  preferredRuntime?: string
  planResponse?: string
  projectKind?: 'git' | 'folder'
  /** Replaces the default chat-writing worker turn (an interactive worker writes no chat). */
  workerTurn?: (sessionId: string, prompt: string) => Promise<'ended'>
  internalSessions?: { outputBuffer: string; nonInteractive?: boolean; lastOutputTime?: number }
  /** Decides how each turn completes, keyed by the file it was waiting for. 'pending' never
   *  resolves, standing in for a worker that is blocked. */
  doneOutcome?: (path: string) => 'done' | 'timeout' | 'aborted' | 'pending'
  /** Fired when a turn starts waiting, to simulate the screen changing mid-turn. */
  onWaitStarted?: () => void
} = {}) {
  const statuses: string[] = []
  const sent: { channel: string; payload: unknown }[] = []
  const sessions = {
    getSession: vi.fn((id: string) => (id === 'viola-1' ? {
      id: 'viola-1',
      projectId: 'project-1',
      runtimeId: 'viola',
      worktreePath: '/wt/base',
    } : undefined)),
    getInternalSession: vi.fn(() => options.internalSessions),
    sendInput: vi.fn(),
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
  // A worker's reply now arrives through the chat store as its turn runs, not from a driver call.
  sessions.sendInput = vi.fn((sessionId: string, raw: string) => {
    if (raw === '\r' || options.workerTurn) return
    const text = unframe(raw)
    chat.addAgentMessage(
      sessionId,
      text.startsWith('You are an independent code reviewer')
        ? '{"passed":true,"blocking":[],"nonBlocking":["Consider a shared helper."]}'
        : 'Added the validator and ran the gate.',
    )
  })
  const controlService = { runTurn: vi.fn(), cancelTurn: vi.fn() }
  const git = {
    head: vi.fn(async () => 'base-sha'),
    diff: vi.fn(async () => 'diff --git a/v b/v'),
    diffStat: vi.fn(async () => ' v | 1 +'),
    apply: vi.fn(async () => undefined),
    pullRequestUrl: vi.fn(async () => 'https://example.test/pr/1'),
  }
  const gates = { run: vi.fn(async () => ({ ok: true, output: '1 passed' })) }
  // Stands in for the file a worker writes when it is genuinely finished.
  const done = {
    donePath: vi.fn((worktreePath: string) => `${worktreePath}/.viola/done`),
    clear: vi.fn(async () => undefined),
    wait: vi.fn(async (path: string) => {
      options.onWaitStarted?.()
      const outcome = options.doneOutcome?.(path) ?? ('done' as const)
      if (outcome === 'pending') return new Promise<never>(() => {})
      return outcome
    }),
  }
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
      done,
      readyPollMs: 5,
      composerWaitMs: 40,
      submitDelayMs: 5,
    },
  )
  return { harness, chat, aiGenerate, spawnService, controlService, git, gates, statuses, sent, sessions, done }
}

/** An idle terminal every runtime's readiness check accepts (claude's ❯ and codex's ›): one
 *  internal-session double serves both the claude implementer and the codex reviewer. */
const READY_TUI = 'Welcome back\n❯ \n› '

/** What a TUI hands its model after taking a bracketed paste: the text without the frame. */
function unframe(text: string): string {
  return text.replace(/^\u001b\[200~/, '').replace(/\u001b\[201~$/, '')
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
      title: 'Validation', runtimeId: 'claude', newWorktree: true, nonInteractive: false,
    }))
    expect(gates.run).toHaveBeenCalledWith('/wt/Validation-1', 'npm test -- src/validation', expect.anything())
    expect(git.apply).toHaveBeenCalledWith('/wt/review-validation-2', 'diff --git a/v b/v')
  })

  it('reads an interactive worker\'s report from its terminal, stripped of escape codes', async () => {
    const noisy = '\u001b[2K\u001b[1;36m> \u001b[0mAdded the validator.\r\n'
      + '\u001b[38;5;246mRan npm test -- src/validation: 4 passed.\u001b[0m\r\n'
      + '\u001b[2m' + READY_TUI + '\u001b[0m'
    const { harness, chat, sessions } = setup({
      // An interactive worker writes to its PTY, never to the chat store.
      workerTurn: async () => 'ended',
      internalSessions: { outputBuffer: noisy },
    })
    harness.send('viola-1', 'Add validation')
    await vi.waitFor(() => expect(chat.getMessages('viola-1')).toHaveLength(1))

    harness.send('viola-1', 'Start plan')
    await vi.waitFor(() => expect(texts(chat, 'viola-1').at(-1)).toContain('## Run'))

    const reviewPrompt = vi.mocked(sessions.sendInput).mock.calls
      .map(([, text]) => unframe(text as string))
      .find((text) => text.startsWith('You are an independent code reviewer'))!
    expect(reviewPrompt).toContain('Added the validator.')
    expect(reviewPrompt).toContain('4 passed.')
    expect(reviewPrompt).not.toContain('\u001b')
    expect(sessions.getInternalSession).toHaveBeenCalled()
  })

  it('waits for the worker\'s completion file instead of an idle-looking terminal', async () => {
    // The bug this pins: a TUI keeps its prompt glyph on screen while it works, so the shared
    // turn-end heuristic called a paused worker finished, and Viola reviewed an untouched tree.
    const { harness, chat, done, sessions, git } = setup({
      workerTurn: async () => 'ended',
      internalSessions: { outputBuffer: READY_TUI },
      doneOutcome: (path) => (path.endsWith('/.viola/done') ? 'timeout' : 'done'),
    })
    harness.send('viola-1', 'Add validation')
    await vi.waitFor(() => expect(chat.getMessages('viola-1')).toHaveLength(1))

    harness.send('viola-1', 'Start plan')
    await vi.waitFor(() => expect(texts(chat, 'viola-1').at(-1)).toContain('## Run needs attention'))

    // It waited on the implementer's marker, and reported a timeout rather than a phantom result.
    expect(done.wait).toHaveBeenCalledWith(
      expect.stringContaining('/.viola/done'),
      expect.objectContaining({ timeoutMs: 30 * 60 * 1000 }),
    )
    expect(texts(chat, 'viola-1').at(-1)).toContain('Implementation timeout')
    // No diff was taken and no reviewer was spawned off a turn that never finished.
    expect(git.diff).not.toHaveBeenCalled()
    // The stalled worker is interrupted rather than left running.
    expect(vi.mocked(sessions.interruptSession)).toHaveBeenCalled()
  })

  it('frames an interactive prompt as one bracketed paste so newlines are not Enter presses', async () => {
    // The gate-fix prompt reached a real worker as its last 133 characters: typed raw into the
    // PTY, every newline submitted a fragment, and Claude never saw the task or the path to write.
    const { harness, chat, sessions } = setup({
      workerTurn: async () => 'ended',
      internalSessions: { outputBuffer: READY_TUI, nonInteractive: false },
    })
    harness.send('viola-1', 'Add validation')
    await vi.waitFor(() => expect(chat.getMessages('viola-1')).toHaveLength(1))

    harness.send('viola-1', 'Start plan')
    await vi.waitFor(() => expect(texts(chat, 'viola-1').at(-1)).toContain('## Run'))

    const writes = vi.mocked(sessions.sendInput).mock.calls.map(([, text]) => text as string)
    const framed = writes.filter((text) => text.startsWith('\u001b[200~') && text.endsWith('\u001b[201~'))
    expect(framed.length).toBeGreaterThan(0)
    // The whole multi-line prompt sits inside one frame, followed by a separate Enter.
    expect(framed[0]).toContain('IMPLEMENT this scoped task')
    expect(framed[0]).toContain('write the single word DONE')
    expect(writes[writes.indexOf(framed[0]) + 1]).toBe('\r')
  })

  it('sends anyway when the composer never appears, instead of failing a healthy worker', async () => {
    // The previous gate demanded MCP startup be finished and the screen quiet for 1.5s. Codex
    // takes typing during startup (its slowest server allows 120s) and a TUI animates while
    // idle, so a healthy worker was failed before it was ever prompted.
    const tui = { outputBuffer: 'a screen this code cannot parse', nonInteractive: false, lastOutputTime: Date.now() }
    const { harness, chat, sessions } = setup({ workerTurn: async () => 'ended', internalSessions: tui })
    harness.send('viola-1', 'Add validation')
    await vi.waitFor(() => expect(chat.getMessages('viola-1')).toHaveLength(1))

    harness.send('viola-1', 'Start plan')
    await vi.waitFor(() => expect(texts(chat, 'viola-1').at(-1)).toContain('## Run'))

    const typed = vi.mocked(sessions.sendInput).mock.calls.filter(([, t]) => (t as string) !== '\r')
    expect(typed.length).toBeGreaterThan(0)
    expect(unframe(typed[0][1] as string)).toContain('IMPLEMENT this scoped task')
    expect(texts(chat, 'viola-1').at(-1)).not.toContain('ready composer')
  })

  it('refuses to press Enter into a dialog and says which one', async () => {
    // Enter on codex's update menu runs `brew upgrade`; on a trust dialog it answers a security
    // question. Neither may be answered on the user's behalf.
    const tui = { outputBuffer: '› 1. Update now (runs `brew upgrade --cask codex`)\n  2. Skip', nonInteractive: false, lastOutputTime: Date.now() - 5000 }
    const { harness, chat, sessions } = setup({ workerTurn: async () => 'ended', internalSessions: tui })
    harness.send('viola-1', 'Add validation')
    await vi.waitFor(() => expect(chat.getMessages('viola-1')).toHaveLength(1))

    harness.send('viola-1', 'Start plan')
    await vi.waitFor(() => expect(texts(chat, 'viola-1').at(-1)).toContain('## Run'))

    expect(vi.mocked(sessions.sendInput)).not.toHaveBeenCalled()
    expect(texts(chat, 'viola-1').at(-1)).toContain('startup update menu')
  })

  it('waits for a composer to be drawn before sending, when it can see one', async () => {
    // A codex reviewer received Viola's prompt while still on its startup banner ("Starting MCP
    // servers (0/2)"); the shared status called that "waiting", the composer redrew, the text
    // was gone, and the reviewer sat idle until its budget ran out.
    // Routed to claude; the per-runtime shapes are pinned on the predicates in worker-ready.test.ts.
    const tui = { outputBuffer: 'Welcome to Claude Code!\n⠋ Loading…', nonInteractive: false, lastOutputTime: Date.now() }
    const { harness, chat, sessions } = setup({ workerTurn: async () => 'ended', internalSessions: tui })
    harness.send('viola-1', 'Add validation')
    await vi.waitFor(() => expect(chat.getMessages('viola-1')).toHaveLength(1))

    harness.send('viola-1', 'Start plan')
    // Inside the composer-wait window (40ms here): nothing should be typed yet.
    await new Promise((r) => setTimeout(r, 15))
    const typed = () => vi.mocked(sessions.sendInput).mock.calls.filter(([, t]) => (t as string) !== '\r')
    expect(typed()).toHaveLength(0)

    // Composer drawn: now the prompt goes in.
    tui.outputBuffer = READY_TUI
    await vi.waitFor(() => expect(typed().length).toBeGreaterThan(0))
    expect(unframe(typed()[0][1] as string)).toContain('IMPLEMENT this scoped task')
  })

  it('stops waiting when a worker asks mid-turn for an approval only a human can give', async () => {
    // A deny rule can escalate a command whose path Claude cannot prove, even under bypass. The
    // worker then sits at "Do you want to proceed?" — previously for the full 30-minute budget.
    const tui = { outputBuffer: READY_TUI, nonInteractive: false, lastOutputTime: Date.now() - 5000 }
    const { harness, chat } = setup({
      workerTurn: async () => 'ended',
      internalSessions: tui,
      // The completion file never arrives, because the worker is blocked on the prompt.
      doneOutcome: () => 'pending',
      onWaitStarted: () => {
        tui.outputBuffer = 'Bash command\n\nDo you want to proceed?\n❯ 1. Yes\n  2. No'
      },
    })
    harness.send('viola-1', 'Add validation')
    await vi.waitFor(() => expect(chat.getMessages('viola-1')).toHaveLength(1))

    harness.send('viola-1', 'Start plan')

    await vi.waitFor(() => expect(texts(chat, 'viola-1').at(-1)).toContain('## Run'), { timeout: 3000 })
    expect(texts(chat, 'viola-1').at(-1)).toContain('waiting for your approval')
  })

  it('clears a stale completion file before each turn', async () => {
    const { harness, chat, done } = setup()
    harness.send('viola-1', 'Add validation')
    await vi.waitFor(() => expect(chat.getMessages('viola-1')).toHaveLength(1))

    harness.send('viola-1', 'Start plan')
    await vi.waitFor(() => expect(texts(chat, 'viola-1').at(-1)).toContain('## Run'))

    // Otherwise a turn inherits the previous turn's completion and returns instantly.
    for (const [path] of done.wait.mock.calls) {
      expect(done.clear).toHaveBeenCalledWith(path)
    }
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
