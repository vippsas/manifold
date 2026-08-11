import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SessionWorkingSet } from './session-working-set'
import type { InternalSession } from './session-types'
import type { WorkingSetNotice } from '../../shared/types'

const NEW_DIR = '/repo/shared'

function makeSession(overrides: Partial<InternalSession> = {}): InternalSession {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    runtimeId: 'claude',
    branchName: 'manifold/ws',
    worktreePath: '/repo/web',
    status: 'waiting',
    pid: 1234,
    ptyId: 'pty-1',
    outputBuffer: '❯ ',
    additionalDirs: [],
    workspaceId: 'ws-1',
    workspaceWorktreePaths: { 'proj-1': '/repo/web' },
    ...overrides,
  } as InternalSession
}

interface Harness {
  workingSet: SessionWorkingSet
  sessions: Map<string, InternalSession>
  writes: string[]
  notices: WorkingSetNotice[]
  events: { channel: string; payload: unknown }[]
  persisted: InternalSession[]
  watched: { dir: string; sessionId: string }[]
}

/** Drives the module's polling without real timers: every wait is a chance for
 *  the fake runtime to react to what was typed. */
function harness(sessionList: InternalSession[], onWrite?: (s: InternalSession, input: string) => void): Harness {
  const sessions = new Map(sessionList.map((s) => [s.id, s]))
  const writes: string[] = []
  const events: { channel: string; payload: unknown }[] = []
  const notices: WorkingSetNotice[] = []
  const persisted: InternalSession[] = []
  const watched: { dir: string; sessionId: string }[] = []

  const workingSet = new SessionWorkingSet({
    sessions,
    ptyPool: {
      write: (ptyId: string, input: string) => {
        const session = [...sessions.values()].find((s) => s.ptyId === ptyId)!
        writes.push(input)
        onWrite?.(session, input)
      },
    },
    getFileWatcher: () => ({ watchAdditionalDir: (dir: string, sessionId: string) => { watched.push({ dir, sessionId }) } }),
    persist: (session) => { persisted.push(session) },
    sendToRenderer: (channel, payload) => {
      events.push({ channel, payload })
      if (channel === 'agent:working-set-notice') notices.push(payload as WorkingSetNotice)
    },
    wait: () => Promise.resolve(),
  })

  return { workingSet, sessions, writes, notices, events, persisted, watched }
}

/** What Claude Code 2.1.224 prints once it accepts the folder. */
function claudeAccepts(session: InternalSession, dir: string): void {
  session.outputBuffer += `⎿ Added\x1b[12G${dir}\x1b[80Gas\x1b[83Ga\x1b[85Gworking\x1b[93Gdirectory\x1b[103Gfor\x1b[107Gthis\x1b[112Gsession`
}

describe('SessionWorkingSet', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('types the command into a running Claude agent and reports it live', async () => {
    let submitted = false
    const session = makeSession()
    const h = harness([session], (s, input) => {
      if (input.startsWith('/add-dir')) return
      if (!submitted) { submitted = true; return } // first \r opens the confirm dialog
      claudeAccepts(s, NEW_DIR)                    // second \r accepts it
    })

    await h.workingSet.addDirToWorkspace('ws-1', 'proj-2', NEW_DIR)

    expect(h.writes).toEqual([`/add-dir ${NEW_DIR}`, '\r', '\r'])
    expect(h.notices).toEqual([
      { sessionId: 'sess-1', agentName: 'manifold/ws', dir: NEW_DIR, delivery: 'live' },
    ])
    expect(session.additionalDirs).toEqual([NEW_DIR])
  })

  it('records the folder in session state before typing anything', async () => {
    const session = makeSession()
    const h = harness([session], (s, input) => { if (input === '\r') claudeAccepts(s, NEW_DIR) })

    await h.workingSet.addDirToWorkspace('ws-1', 'proj-2', NEW_DIR)

    expect(session.additionalDirs).toContain(NEW_DIR)
    expect(session.workspaceWorktreePaths).toEqual({ 'proj-1': '/repo/web', 'proj-2': NEW_DIR })
    expect(h.persisted).toContain(session)
    expect(h.watched).toEqual([{ dir: NEW_DIR, sessionId: 'sess-1' }])
    expect(h.events[0]).toEqual({
      channel: 'agent:dirs-changed',
      payload: { sessionId: 'sess-1', additionalDirs: [NEW_DIR] },
    })
  })

  it('falls back to a manual notice when the agent never confirms', async () => {
    const session = makeSession()
    const h = harness([session]) // runtime prints nothing back

    await h.workingSet.addDirToWorkspace('ws-1', 'proj-2', NEW_DIR)

    expect(h.notices).toHaveLength(1)
    expect(h.notices[0]).toMatchObject({
      delivery: 'manual',
      dir: NEW_DIR,
      command: `/add-dir ${NEW_DIR}`,
      error: 'the agent never confirmed the folder',
    })
    // The folder is still recorded, so a restart picks it up.
    expect(session.additionalDirs).toEqual([NEW_DIR])
  })

  it('never types into an agent that is holding a permission prompt', async () => {
    const session = makeSession({ outputBuffer: 'Do you want to proceed?\n❯ 1. Yes\n  2. No' })
    const h = harness([session])

    await h.workingSet.addDirToWorkspace('ws-1', 'proj-2', NEW_DIR)

    expect(h.writes).toEqual([])
    expect(h.notices[0]).toMatchObject({
      delivery: 'manual',
      error: 'the agent was busy or holding a prompt',
    })
  })

  it('never types into a runtime that has no runtime add-dir command', async () => {
    const session = makeSession({ runtimeId: 'codex' })
    const h = harness([session])

    await h.workingSet.addDirToWorkspace('ws-1', 'proj-2', NEW_DIR)

    expect(h.writes).toEqual([])
    expect(h.notices[0]).toMatchObject({ delivery: 'restart-required', dir: NEW_DIR })
    expect(session.additionalDirs).toEqual([NEW_DIR])
  })

  it('leaves a chat-mode agent to pick the folder up on its next turn', async () => {
    const session = makeSession({ nonInteractive: true, ptyId: '' })
    const h = harness([session])

    await h.workingSet.addDirToWorkspace('ws-1', 'proj-2', NEW_DIR)

    expect(h.writes).toEqual([])
    expect(h.notices[0]).toMatchObject({ delivery: 'next-turn', dir: NEW_DIR })
    expect(session.additionalDirs).toEqual([NEW_DIR])
  })

  it('applies a single Enter for Copilot, which has no confirmation dialog', async () => {
    const session = makeSession({ runtimeId: 'copilot' })
    const h = harness([session], (s, input) => {
      if (input === '\r') s.outputBuffer += `● Added directory to allowed list: ${NEW_DIR}/\r\n`
    })

    await h.workingSet.addDirToWorkspace('ws-1', 'proj-2', NEW_DIR)

    expect(h.writes).toEqual([`/add-dir ${NEW_DIR}`, '\r'])
    expect(h.notices[0]).toMatchObject({ delivery: 'live' })
  })

  it('reaches every agent in the workspace and skips agents of other workspaces', async () => {
    const mine = makeSession({ id: 'a', ptyId: 'pty-a', runtimeId: 'codex' })
    const alsoMine = makeSession({ id: 'b', ptyId: 'pty-b', runtimeId: 'codex' })
    const other = makeSession({ id: 'c', ptyId: 'pty-c', runtimeId: 'codex', workspaceId: 'ws-2' })
    const h = harness([mine, alsoMine, other])

    await h.workingSet.addDirToWorkspace('ws-1', 'proj-2', NEW_DIR)

    expect(h.notices.map((n) => n.sessionId).sort()).toEqual(['a', 'b'])
    expect(other.additionalDirs).toEqual([])
  })

  it('ignores a folder an agent already has', async () => {
    const already = makeSession({ additionalDirs: [NEW_DIR] })
    const primary = makeSession({ id: 'p', ptyId: 'pty-p', worktreePath: NEW_DIR })
    const h = harness([already, primary])

    await h.workingSet.addDirToWorkspace('ws-1', 'proj-2', NEW_DIR)

    expect(h.notices).toEqual([])
    expect(h.writes).toEqual([])
    expect(already.additionalDirs).toEqual([NEW_DIR])
  })

  it('reports a manual fallback when the agent stays busy', async () => {
    const session = makeSession({ status: 'running', outputBuffer: 'Interrupt to stop' })
    const h = harness([session])

    await h.workingSet.addDirToWorkspace('ws-1', 'proj-2', NEW_DIR)

    expect(h.writes).toEqual([])
    expect(h.notices[0]).toMatchObject({ delivery: 'manual', error: 'the agent was busy or holding a prompt' })
  })
})
