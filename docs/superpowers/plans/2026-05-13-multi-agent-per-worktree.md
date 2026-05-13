# Multi-Agent Per Worktree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users spawn a sibling AI agent on the same worktree as an existing agent, via a "+" overlay button on the agent terminal panel.

**Architecture:** The main-process plumbing (`SpawnAgentOptions.existingWorktreePath`) already supports session siblings on a shared worktree — used today by the superagent orchestrator. This plan adds (1) a renderer "+" overlay + runtime popover on the Agent panel that invokes the existing spawn flow with `existingWorktreePath`, and (2) a correctness fix to `SessionTeardown` so deleting one sibling doesn't tear down the worktree while another sibling is alive. Sibling switching reuses the existing sidebar list; no new dockview tabs in v1.

**Tech Stack:** TypeScript, React, Electron, vitest, dockview (already in use).

**Spec:** `docs/superpowers/specs/2026-05-13-multi-agent-per-worktree-design.md`

---

## File Structure

**Create:**
- `src/renderer/components/editor/AddSiblingAgentButton.tsx` — overlay button + runtime picker popover. Hover-revealed on agent panel.
- `src/renderer/components/editor/AddSiblingAgentButton.test.tsx` — component tests.
- `src/main/session/session-teardown.test.ts` — unit tests covering share-count behavior.

**Modify:**
- `src/main/session/session-teardown.ts` — guard worktree removal on shared paths.
- `src/renderer/components/editor/dock-panels.tsx` — wire `AddSiblingAgentButton` into `AgentPanel`.
- `src/renderer/components/editor/dock-panel-types.ts` — add `activeSessionWorktreePath` and `activeSessionNoWorktree` to `DockAppState`.
- `src/renderer/App.tsx` — populate the new dock-state fields from `activeSession`.

---

## Task 1: SessionTeardown share-count guard

**Files:**
- Modify: `src/main/session/session-teardown.ts`
- Create: `src/main/session/session-teardown.test.ts`

The `killInteractiveSession` method currently always removes the worktree on delete. When sibling sessions share a worktree, deleting one must not remove the worktree if another is alive.

- [ ] **Step 1: Write the failing share-count test**

Create `src/main/session/session-teardown.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../git/git-exec', () => ({
  gitExec: vi.fn().mockResolvedValue(''),
}))

vi.mock('../git/managed-worktree', () => ({
  getManagedWorktreeStatus: vi.fn().mockResolvedValue(''),
  commitManagedWorktree: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../git/worktree-meta', () => ({
  removeWorktreeMeta: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../app/debug-log', () => ({
  debugLog: vi.fn(),
}))

import { SessionTeardown } from './session-teardown'
import { gitExec } from '../git/git-exec'
import type { InternalSession } from './session-types'
import type { PtyPool } from '../agent/pty-pool'
import type { ProjectRegistry } from '../store/project-registry'

function makeSession(overrides: Partial<InternalSession>): InternalSession {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    runtimeId: 'claude',
    branchName: 'manifold/oslo',
    worktreePath: '/repo/.manifold/worktrees/manifold-oslo',
    status: 'running',
    pid: 123,
    ptyId: 'pty-1',
    outputBuffer: '',
    additionalDirs: [],
    ...overrides,
  } as InternalSession
}

function makeMocks(sessions: Map<string, InternalSession>) {
  const ptyPool = { kill: vi.fn() } as unknown as PtyPool
  const projectRegistry = {
    getProject: vi.fn(() => ({ id: 'proj-1', name: 'test', path: '/repo', baseBranch: 'main', addedAt: '' })),
  } as unknown as ProjectRegistry
  const onKillSession = vi.fn().mockResolvedValue(undefined)
  return {
    teardown: new SessionTeardown(sessions, ptyPool, projectRegistry, onKillSession),
    ptyPool,
    onKillSession,
  }
}

describe('SessionTeardown.killInteractiveSession', () => {
  beforeEach(() => {
    vi.mocked(gitExec).mockClear()
    vi.mocked(gitExec).mockResolvedValue('')
  })

  it('removes the worktree when no other sessions share it', async () => {
    const sess = makeSession({ id: 'sess-1' })
    const sessions = new Map([[sess.id, sess]])
    const { teardown } = makeMocks(sessions)

    await teardown.killInteractiveSession('sess-1')

    const calls = vi.mocked(gitExec).mock.calls.map((c) => c[0])
    expect(calls).toContainEqual(['worktree', 'remove', sess.worktreePath, '--force'])
  })

  it('keeps the worktree when another live session shares the path', async () => {
    const a = makeSession({ id: 'sess-a', ptyId: 'pty-a' })
    const b = makeSession({ id: 'sess-b', ptyId: 'pty-b', runtimeId: 'codex' })
    const sessions = new Map([[a.id, a], [b.id, b]])
    const { teardown } = makeMocks(sessions)

    await teardown.killInteractiveSession('sess-a')

    const calls = vi.mocked(gitExec).mock.calls.map((c) => c[0])
    expect(calls).not.toContainEqual(['worktree', 'remove', a.worktreePath, '--force'])
  })

  it('removes the worktree when the only other session on the path has already exited', async () => {
    const a = makeSession({ id: 'sess-a' })
    const dead = makeSession({ id: 'sess-dead', pid: null, ptyId: '' })
    const sessions = new Map([[a.id, a], [dead.id, dead]])
    const { teardown } = makeMocks(sessions)

    await teardown.killInteractiveSession('sess-a')

    const calls = vi.mocked(gitExec).mock.calls.map((c) => c[0])
    expect(calls).toContainEqual(['worktree', 'remove', a.worktreePath, '--force'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/main/session/session-teardown.test.ts
```

Expected: the second test ("keeps the worktree when another live session shares the path") FAILS because the current implementation always issues the `worktree remove` command.

- [ ] **Step 3: Implement the share-count guard**

In `src/main/session/session-teardown.ts`, inside `killInteractiveSession`, replace the worktree-removal block. Find:

```ts
    if (!session.noWorktree) {
      try {
        await gitExec(['worktree', 'remove', worktreePath, '--force'], this.projectRegistry.getProject(projectId)?.path ?? '')
        await removeWorktreeMeta(worktreePath)
      } catch {
        // Best-effort cleanup
      }
      session.noWorktree = true
    }
```

Replace with:

```ts
    if (!session.noWorktree && !this.hasOtherLiveSessionsOnPath(sessionId, worktreePath)) {
      try {
        await gitExec(['worktree', 'remove', worktreePath, '--force'], this.projectRegistry.getProject(projectId)?.path ?? '')
        await removeWorktreeMeta(worktreePath)
      } catch {
        // Best-effort cleanup
      }
      session.noWorktree = true
    }
```

Then add the helper as a private method on `SessionTeardown`:

```ts
  private hasOtherLiveSessionsOnPath(excludeId: string, worktreePath: string): boolean {
    for (const other of this.sessions.values()) {
      if (other.id === excludeId) continue
      if (other.worktreePath !== worktreePath) continue
      if (other.pid == null) continue
      if (!other.ptyId) continue
      return true
    }
    return false
  }
```

A session is considered "live" when it still has both a `pid` and an open `ptyId`. Dormant/exited sessions (their `ptyId` is cleared when their PTY exits, and `pid` becomes null) do not block worktree removal.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/main/session/session-teardown.test.ts
```

Expected: all three tests PASS.

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: clean exit.

- [ ] **Step 6: Commit**

```bash
git add src/main/session/session-teardown.ts src/main/session/session-teardown.test.ts
git commit -m "fix(session): keep worktree alive when sibling sessions share it"
```

---

## Task 2: Add active worktree info to DockAppState

The sibling button needs to know the active session's `worktreePath` and `noWorktree` flag. These are not currently in `DockAppState`.

**Files:**
- Modify: `src/renderer/components/editor/dock-panel-types.ts`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Extend DockAppState**

In `src/renderer/components/editor/dock-panel-types.ts`, find the block:

```ts
  // Agent creation
  baseBranch: string
  defaultRuntime: string
  onLaunchAgent: (options: SpawnAgentOptions) => Promise<unknown>
```

Add two new fields:

```ts
  // Agent creation
  baseBranch: string
  defaultRuntime: string
  activeSessionWorktreePath: string | null
  activeSessionNoWorktree: boolean
  onLaunchAgent: (options: SpawnAgentOptions) => Promise<unknown>
```

- [ ] **Step 2: Populate them in App.tsx**

In `src/renderer/App.tsx`, find the `dockState` object literal (around line 295). Add the two new fields near `baseBranch`/`defaultRuntime`:

```ts
    baseBranch, defaultRuntime: settings.defaultRuntime,
    activeSessionWorktreePath: activeSession?.worktreePath ?? null,
    activeSessionNoWorktree: activeSession?.noWorktree ?? false,
    onLaunchAgent: overlays.handleLaunchAgent,
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: clean exit. (This will catch any test files that build a `DockAppState` mock; if so, those need the new fields too — fix them by adding `activeSessionWorktreePath: null, activeSessionNoWorktree: false` to each mock object.)

- [ ] **Step 4: Run tests to confirm nothing regressed**

```bash
npm test -- --run
```

Expected: all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/editor/dock-panel-types.ts src/renderer/App.tsx
git commit -m "feat(dock): expose active session worktree info to dock panels"
```

---

## Task 3: AddSiblingAgentButton component (TDD)

**Files:**
- Create: `src/renderer/components/editor/AddSiblingAgentButton.tsx`
- Create: `src/renderer/components/editor/AddSiblingAgentButton.test.tsx`

- [ ] **Step 1: Write the failing component tests**

Create `src/renderer/components/editor/AddSiblingAgentButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import type { AgentRuntime, SpawnAgentOptions } from '../../../shared/types'
import { AddSiblingAgentButton } from './AddSiblingAgentButton'

const MOCK_RUNTIMES: AgentRuntime[] = [
  { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
  { id: 'codex', name: 'Codex', binary: 'codex', installed: true },
  { id: 'gemini', name: 'Gemini', binary: 'gemini', installed: false },
  { id: 'ollama', name: 'Ollama', binary: 'ollama', installed: true, needsModel: true },
]

function setup(overrides: Partial<{
  worktreePath: string | null
  noWorktree: boolean
  projectId: string | null
  onLaunch: (opts: SpawnAgentOptions) => Promise<unknown>
}> = {}) {
  const onLaunch = overrides.onLaunch ?? vi.fn().mockResolvedValue(undefined)
  const invokeMock = vi.fn((channel: string) => {
    if (channel === 'runtimes:list') return Promise.resolve(MOCK_RUNTIMES)
    return Promise.resolve(null)
  })
  ;(window as unknown as { electronAPI: { invoke: typeof invokeMock } }).electronAPI = { invoke: invokeMock }

  render(
    <AddSiblingAgentButton
      projectId={overrides.projectId ?? 'proj-1'}
      worktreePath={overrides.worktreePath ?? '/repo/wt'}
      noWorktree={overrides.noWorktree ?? false}
      onLaunch={onLaunch}
    />
  )
  return { onLaunch, invokeMock }
}

describe('AddSiblingAgentButton', () => {
  beforeEach(() => {
    cleanup()
  })

  it('does not render when there is no worktree', () => {
    setup({ worktreePath: null })
    expect(screen.queryByRole('button', { name: /add agent/i })).toBeNull()
  })

  it('does not render for noWorktree sessions', () => {
    setup({ noWorktree: true })
    expect(screen.queryByRole('button', { name: /add agent/i })).toBeNull()
  })

  it('does not render without an active project', () => {
    setup({ projectId: null })
    expect(screen.queryByRole('button', { name: /add agent/i })).toBeNull()
  })

  it('opens the runtime picker when clicked', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /add agent/i }))
    await waitFor(() => expect(screen.getByText('Claude Code')).toBeTruthy())
    expect(screen.getByText('Codex')).toBeTruthy()
  })

  it('skips runtimes that need a model and runtimes that are not installed', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /add agent/i }))
    await waitFor(() => expect(screen.getByText('Claude Code')).toBeTruthy())
    expect(screen.queryByText('Ollama')).toBeNull()
    expect(screen.queryByText('Gemini')).toBeNull()
  })

  it('invokes onLaunch with existingWorktreePath when a runtime is picked', async () => {
    const onLaunch = vi.fn().mockResolvedValue(undefined)
    setup({ onLaunch })
    fireEvent.click(screen.getByRole('button', { name: /add agent/i }))
    await waitFor(() => screen.getByText('Codex'))
    fireEvent.click(screen.getByText('Codex'))
    expect(onLaunch).toHaveBeenCalledWith({
      projectId: 'proj-1',
      runtimeId: 'codex',
      prompt: '',
      existingWorktreePath: '/repo/wt',
    })
  })

  it('closes the popover after picking a runtime', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /add agent/i }))
    await waitFor(() => screen.getByText('Claude Code'))
    fireEvent.click(screen.getByText('Claude Code'))
    await waitFor(() => expect(screen.queryByText('Codex')).toBeNull())
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/renderer/components/editor/AddSiblingAgentButton.test.tsx
```

Expected: FAIL with "Cannot find module ... AddSiblingAgentButton".

- [ ] **Step 3: Implement the component**

Create `src/renderer/components/editor/AddSiblingAgentButton.tsx`:

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentRuntime, SpawnAgentOptions } from '../../../shared/types'

interface AddSiblingAgentButtonProps {
  projectId: string | null
  worktreePath: string | null
  noWorktree: boolean
  onLaunch: (options: SpawnAgentOptions) => Promise<unknown>
}

export function AddSiblingAgentButton({
  projectId,
  worktreePath,
  noWorktree,
  onLaunch,
}: AddSiblingAgentButtonProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [runtimes, setRuntimes] = useState<AgentRuntime[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    void window.electronAPI.invoke('runtimes:list').then((list) => {
      setRuntimes((list as AgentRuntime[]).filter((r) => r.installed !== false && !r.needsModel))
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  const handlePick = useCallback(
    (runtimeId: string): void => {
      if (!projectId || !worktreePath) return
      setOpen(false)
      void onLaunch({
        projectId,
        runtimeId,
        prompt: '',
        existingWorktreePath: worktreePath,
      })
    },
    [projectId, worktreePath, onLaunch]
  )

  if (!projectId || !worktreePath || noWorktree) return null

  return (
    <div ref={wrapperRef} style={styles.wrapper}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={styles.button}
        aria-label="Add agent on this worktree"
        title="Add agent on this worktree"
      >
        +
      </button>
      {open && (
        <div style={styles.popover} role="menu">
          <div style={styles.popoverHeader}>Add agent here</div>
          {runtimes.length === 0 ? (
            <div style={styles.empty}>No runtimes available</div>
          ) : (
            runtimes.map((r) => (
              <button
                key={r.id}
                type="button"
                style={styles.runtimeRow}
                onClick={() => handlePick(r.id)}
                role="menuitem"
              >
                {r.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 5,
  },
  button: {
    width: 24,
    height: 24,
    borderRadius: 6,
    background: 'color-mix(in srgb, var(--bg-secondary) 85%, transparent)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    fontSize: 14,
    lineHeight: 1,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popover: {
    position: 'absolute',
    top: 30,
    right: 0,
    minWidth: 180,
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
    padding: 4,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  popoverHeader: {
    fontSize: 11,
    color: 'var(--text-muted)',
    padding: '6px 8px 4px',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  runtimeRow: {
    appearance: 'none',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-primary)',
    padding: '6px 8px',
    borderRadius: 6,
    fontSize: 13,
    textAlign: 'left',
    cursor: 'pointer',
  },
  empty: {
    fontSize: 12,
    color: 'var(--text-muted)',
    padding: '6px 8px',
  },
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/renderer/components/editor/AddSiblingAgentButton.test.tsx
```

Expected: all six tests PASS.

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: clean exit.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/editor/AddSiblingAgentButton.tsx src/renderer/components/editor/AddSiblingAgentButton.test.tsx
git commit -m "feat(agent): AddSiblingAgentButton component with runtime picker"
```

---

## Task 4: Wire the button into AgentPanel

**Files:**
- Modify: `src/renderer/components/editor/dock-panels.tsx`

- [ ] **Step 1: Add import**

In `src/renderer/components/editor/dock-panels.tsx`, add to the imports near the top:

```ts
import { AddSiblingAgentButton } from './AddSiblingAgentButton'
```

- [ ] **Step 2: Render the button in AgentPanel**

Find the final `return` block of `AgentPanel`. Replace:

```tsx
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <TerminalPane
        sessionId={s.sessionId}
        scrollbackLines={s.scrollbackLines}
        terminalFontFamily={s.terminalFontFamily}
        label="Agent"
        xtermTheme={s.xtermTheme}
      />
      {isExited && (
        <div style={restartOverlayStyles.container}>
          <button onClick={handleRestart} style={restartOverlayStyles.button}>
            Restart Agent
          </button>
        </div>
      )}
    </div>
  )
```

With:

```tsx
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <TerminalPane
        sessionId={s.sessionId}
        scrollbackLines={s.scrollbackLines}
        terminalFontFamily={s.terminalFontFamily}
        label="Agent"
        xtermTheme={s.xtermTheme}
      />
      {!isExited && (
        <AddSiblingAgentButton
          projectId={s.activeProjectId}
          worktreePath={s.activeSessionWorktreePath}
          noWorktree={s.activeSessionNoWorktree}
          onLaunch={s.onLaunchAgent}
        />
      )}
      {isExited && (
        <div style={restartOverlayStyles.container}>
          <button onClick={handleRestart} style={restartOverlayStyles.button}>
            Restart Agent
          </button>
        </div>
      )}
    </div>
  )
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: clean exit.

- [ ] **Step 4: Run full test suite**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 5: Manual smoke test**

```bash
npm run dev
```

In the running app:
1. Open a project and spawn agent A (Claude).
2. Click the "+" button at the top-right of the agent panel.
3. Pick Codex.
4. Confirm a new agent appears in the sidebar with the same branch name but Codex runtime.
5. Click between the two sidebar rows — Agent panel content swaps.
6. Delete the first agent — the worktree should remain (the second agent is still listed and functional).
7. Delete the second agent — the worktree is removed.

Stop the dev server with Ctrl-C when done.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/editor/dock-panels.tsx
git commit -m "feat(agent): show + button on agent panel to spawn sibling agent"
```

---

## Self-Review Notes

- **Spec coverage:**
  - "+" overlay on agent panel → Task 4
  - Runtime picker popover → Task 3
  - Hide on noWorktree / no session / superagent panel → handled in Task 3 (component-level guards) and the superagent panel renders `SuperagentAgentPanel` instead of `AgentPanel` so the button never shows there.
  - `existingWorktreePath` spawn path → Task 3 (button calls `onLaunch` with this option; the existing main-process branch in `SessionCreator.create()` handles it).
  - Worktree teardown safety on shared paths → Task 1.
  - Sidebar already differentiates siblings by runtime label and task description (no change needed; AgentItem secondary line at src/renderer/components/sidebar/AgentItem.tsx:73 covers this).

- **Type consistency:** `existingWorktreePath` matches the existing field on `SpawnAgentOptions` in `src/shared/types.ts`. `activeSessionWorktreePath` and `activeSessionNoWorktree` are new fields added consistently in Tasks 2 and 4.

- **Out of scope (per spec):** dockview sibling tabs, ollama siblings, write-conflict coordination, "shared worktree" badging. Not addressed here.
