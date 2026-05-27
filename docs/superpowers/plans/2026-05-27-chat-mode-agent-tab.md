# Chat-mode Agent Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Chat" mode option to the existing New Agent popover so a chat-style agent tab can coexist with interactive (terminal) agent tabs in the main window.

**Architecture:** The backend already supports `nonInteractive` sessions (used today by `renderer-simple`). We extend the renderer-visible `AgentSession` type to carry the flag, lift the chat UI (`ChatPane`, `ChatMessage`, `useChat`) into a shared module so both renderers consume one source, add a segmented Interactive|Chat toggle to `NewAgentPopover`, and branch the active agent panel (`AgentPanel` in `dock-panels.tsx`) on `session.nonInteractive` to render either the existing terminal view or a new `AgentChatView`. A small `◐` glyph on the agent chip distinguishes chat tabs.

**Tech Stack:** TypeScript, React, Vitest + @testing-library/react, Electron IPC (`window.electronAPI`).

---

## File Map

**Create**
- `src/renderer-shared/chat/ChatPane.tsx` (moved from `renderer-simple`)
- `src/renderer-shared/chat/ChatPane.styles.ts` (moved)
- `src/renderer-shared/chat/ChatMessage.tsx` (moved)
- `src/renderer-shared/chat/ChatMessage.styles.ts` (moved)
- `src/renderer-shared/chat/useChat.ts` (moved)
- `src/renderer-shared/chat/useAgentStatus.ts` (moved)
- `src/renderer-shared/chat/index.ts` (barrel re-exports)
- `src/renderer/components/editor/AgentChatView.tsx`
- `src/renderer/components/editor/AgentChatView.test.tsx`
- `src/renderer/components/modals/NewAgentModeToggle.tsx`
- `src/renderer/components/modals/NewAgentModeToggle.test.tsx`

**Modify**
- `src/shared/types.ts` — add `nonInteractive?: boolean` to `AgentSession`.
- `src/main/session/session-public.ts` — propagate `nonInteractive` in `toPublicSession`.
- `src/renderer/components/modals/NewAgentPopover.tsx` — embed mode toggle, pass `nonInteractive` on submit.
- `src/renderer/components/modals/NewAgentPopover.test.tsx` — cover the new flow.
- `src/renderer/components/editor/dock-panels.tsx` — branch `AgentPanel` on `targetSession.nonInteractive`.
- `src/renderer/components/sidebar/AgentItem.tsx` — render `◐` glyph for chat sessions.
- `src/renderer/components/sidebar/AgentItem.test.tsx` (create if missing) or existing AgentItem test — cover the glyph.
- `src/renderer-simple/App.tsx` — update imports to `renderer-shared/chat`.
- `src/renderer-simple/components/ChatPane.test.tsx` — move with the file or update import paths.
- `src/renderer-simple/components/ChatMessage.test.tsx` (if it exists) — same.

**Run tests with:** `npm test -- <path>` (per `.codex/skills/testing/SKILL.md`; never `npx vitest run`).

---

### Task 1: Add `nonInteractive` to the public `AgentSession` type

**Files:**
- Modify: `src/shared/types.ts:18-40`
- Modify: `src/main/session/session-public.ts:4-21`

- [ ] **Step 1: Add the field to the public type**

In `src/shared/types.ts`, add the field at the bottom of the `AgentSession` interface (before the closing `}`):

```ts
export interface AgentSession {
  id: string
  projectId: string
  runtimeId: string
  branchName: string
  worktreePath: string
  status: AgentStatus
  pid: number | null
  taskDescription?: string
  simpleTemplateTitle?: string
  simplePromptInstructions?: string
  additionalDirs: string[]
  noWorktree?: boolean
  parentSuperagentId?: string
  groupId?: string
  /** True when this session runs Claude in non-interactive (chat) mode. */
  nonInteractive?: boolean
}
```

- [ ] **Step 2: Propagate it in `toPublicSession`**

In `src/main/session/session-public.ts`, add `nonInteractive` to the returned object:

```ts
import type { AgentSession } from '../../shared/types'
import type { InternalSession } from './session-types'

export function toPublicSession(session: InternalSession): AgentSession {
  return {
    id: session.id,
    projectId: session.projectId,
    runtimeId: session.runtimeId,
    branchName: session.branchName,
    worktreePath: session.worktreePath,
    status: session.status,
    pid: session.pid,
    taskDescription: session.taskDescription,
    simpleTemplateTitle: session.simpleTemplateTitle,
    simplePromptInstructions: session.simplePromptInstructions,
    additionalDirs: session.additionalDirs,
    noWorktree: session.noWorktree,
    parentSuperagentId: session.parentSuperagentId,
    groupId: session.groupId,
    nonInteractive: session.nonInteractive,
  }
}
```

- [ ] **Step 3: Run the full suite to make sure no test broke**

Run: `npm test`
Expected: PASS (no test touches `nonInteractive` on `AgentSession` yet; type widening is backward compatible).

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/main/session/session-public.ts
git commit -m "feat(session): expose nonInteractive on public AgentSession"
```

---

### Task 2: Move shared chat module to `renderer-shared`

**Files:**
- Create: `src/renderer-shared/chat/ChatPane.tsx`
- Create: `src/renderer-shared/chat/ChatPane.styles.ts`
- Create: `src/renderer-shared/chat/ChatMessage.tsx`
- Create: `src/renderer-shared/chat/ChatMessage.styles.ts`
- Create: `src/renderer-shared/chat/useChat.ts`
- Create: `src/renderer-shared/chat/index.ts`
- Modify: `src/renderer-simple/App.tsx` (update imports)
- Modify: any other `renderer-simple` files importing `./components/ChatPane`, `./components/ChatMessage`, `./hooks/useChat`

- [ ] **Step 1: Move the files via `git mv` (preserves history)**

```bash
mkdir -p src/renderer-shared/chat
git mv src/renderer-simple/components/ChatPane.tsx          src/renderer-shared/chat/ChatPane.tsx
git mv src/renderer-simple/components/ChatPane.styles.ts    src/renderer-shared/chat/ChatPane.styles.ts
git mv src/renderer-simple/components/ChatMessage.tsx       src/renderer-shared/chat/ChatMessage.tsx
git mv src/renderer-simple/components/ChatMessage.styles.ts src/renderer-shared/chat/ChatMessage.styles.ts
git mv src/renderer-simple/hooks/useChat.ts                 src/renderer-shared/chat/useChat.ts
git mv src/renderer-simple/hooks/useAgentStatus.ts          src/renderer-shared/chat/useAgentStatus.ts
```

If a test file exists alongside (e.g. `ChatPane.test.tsx`), move it too with `git mv` into `src/renderer-shared/chat/`.

- [ ] **Step 2: Fix relative imports inside the moved files**

`ChatPane.tsx` line 2 imports `'../../shared/simple-types'` — after the move the path is the same depth (`src/renderer-shared/chat/` → `src/shared/simple-types`), so it becomes `'../../shared/simple-types'`. Leave it as-is.

`ChatPane.tsx` line 3 imports `'./ChatMessage'` — unchanged (file is in same directory).
`ChatPane.tsx` line 4 imports `'./ChatPane.styles'` — unchanged.

`useChat.ts` line 2 imports `'../../shared/simple-types'` — same depth, leave as-is.

Verify with:
```bash
grep -n "from '" src/renderer-shared/chat/*.ts src/renderer-shared/chat/*.tsx
```
Every import should resolve from the new location. Fix any that don't.

- [ ] **Step 3: Add a barrel `index.ts`**

```ts
// src/renderer-shared/chat/index.ts
export { ChatPane } from './ChatPane'
export { ChatMessage } from './ChatMessage'
export { useChat } from './useChat'
export { useAgentStatus } from './useAgentStatus'
```

- [ ] **Step 4: Update `renderer-simple` imports**

In `src/renderer-simple/App.tsx`, replace any imports from `'./components/ChatPane'`, `'./components/ChatMessage'`, `'./hooks/useChat'`, or `'./hooks/useAgentStatus'` with imports from `'../renderer-shared/chat'`.

Find them with:
```bash
grep -rn "components/ChatPane\|components/ChatMessage\|hooks/useChat\|hooks/useAgentStatus" src/renderer-simple/
```
Update each to:
```ts
import { ChatPane } from '../renderer-shared/chat'
// or
import { useChat } from '../renderer-shared/chat'
```

- [ ] **Step 5: Run `renderer-simple` tests**

Run: `npm test -- src/renderer-simple`
Expected: PASS — same behavior, new paths.

- [ ] **Step 6: Run typecheck for renderer-simple**

Run: `npm run typecheck` (or whatever the project uses — confirm with `cat package.json | grep typecheck`; if absent, skip).
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A src/renderer-shared src/renderer-simple
git commit -m "refactor(chat): move chat UI to renderer-shared for reuse"
```

---

### Task 3: Build `NewAgentModeToggle` component (TDD)

**Files:**
- Create: `src/renderer/components/modals/NewAgentModeToggle.test.tsx`
- Create: `src/renderer/components/modals/NewAgentModeToggle.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/components/modals/NewAgentModeToggle.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { NewAgentModeToggle } from './NewAgentModeToggle'

describe('NewAgentModeToggle', () => {
  it('renders both options and marks the active one', () => {
    render(<NewAgentModeToggle value="interactive" onChange={vi.fn()} />)
    const interactive = screen.getByRole('radio', { name: /interactive/i })
    const chat = screen.getByRole('radio', { name: /chat/i })
    expect(interactive).toHaveAttribute('aria-checked', 'true')
    expect(chat).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onChange when the inactive option is clicked', () => {
    const onChange = vi.fn()
    render(<NewAgentModeToggle value="interactive" onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: /chat/i }))
    expect(onChange).toHaveBeenCalledWith('chat')
  })

  it('supports arrow-key navigation between options', () => {
    const onChange = vi.fn()
    render(<NewAgentModeToggle value="interactive" onChange={onChange} />)
    const group = screen.getByRole('radiogroup')
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('chat')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/renderer/components/modals/NewAgentModeToggle.test.tsx`
Expected: FAIL with "Cannot find module './NewAgentModeToggle'".

- [ ] **Step 3: Implement the component**

```tsx
// src/renderer/components/modals/NewAgentModeToggle.tsx
import React, { useCallback } from 'react'

export type NewAgentMode = 'interactive' | 'chat'

interface NewAgentModeToggleProps {
  value: NewAgentMode
  onChange: (mode: NewAgentMode) => void
}

const OPTIONS: { value: NewAgentMode; label: string }[] = [
  { value: 'interactive', label: 'Interactive' },
  { value: 'chat', label: 'Chat' },
]

export function NewAgentModeToggle({ value, onChange }: NewAgentModeToggleProps): React.JSX.Element {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const idx = OPTIONS.findIndex((o) => o.value === value)
      const next = (idx + (e.key === 'ArrowRight' ? 1 : -1) + OPTIONS.length) % OPTIONS.length
      onChange(OPTIONS[next].value)
    },
    [value, onChange],
  )

  return (
    <div role="radiogroup" aria-label="Agent mode" onKeyDown={handleKeyDown} style={styles.group}>
      {OPTIONS.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            style={{ ...styles.pill, ...(active ? styles.pillActive : null) }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  group: {
    display: 'flex',
    background: 'var(--surface-2)',
    borderRadius: 6,
    padding: 2,
    width: '100%',
  },
  pill: {
    flex: 1,
    padding: '6px 12px',
    background: 'transparent',
    border: 'none',
    borderRadius: 4,
    color: 'var(--text-muted)',
    fontSize: 13,
    cursor: 'pointer',
  },
  pillActive: {
    background: 'var(--surface-1)',
    color: 'var(--text-primary)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
  },
}
```

- [ ] **Step 4: Run the test again**

Run: `npm test -- src/renderer/components/modals/NewAgentModeToggle.test.tsx`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/NewAgentModeToggle.tsx \
        src/renderer/components/modals/NewAgentModeToggle.test.tsx
git commit -m "feat(modals): add Interactive/Chat mode toggle component"
```

---

### Task 4: Wire the toggle into `NewAgentPopover`

**Files:**
- Modify: `src/renderer/components/modals/NewAgentPopover.tsx`
- Modify: `src/renderer/components/modals/NewAgentPopover.test.tsx`

- [ ] **Step 1: Add failing tests for the new behavior**

Append these tests to `src/renderer/components/modals/NewAgentPopover.test.tsx` inside the existing `describe('NewAgentPopover', () => { … })`:

```tsx
  it('defaults to Interactive mode and submits nonInteractive: false', () => {
    const { props } = renderPopover()

    const interactive = screen.getByRole('radio', { name: /interactive/i })
    expect(interactive).toHaveAttribute('aria-checked', 'true')

    const form = screen.getByText('Launch').closest('form')!
    fireEvent.submit(form)

    expect(props.onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ nonInteractive: false }),
    )
  })

  it('submits nonInteractive: true when Chat is selected', () => {
    const { props } = renderPopover()

    fireEvent.click(screen.getByRole('radio', { name: /chat/i }))

    const form = screen.getByText('Launch').closest('form')!
    fireEvent.submit(form)

    expect(props.onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ nonInteractive: true }),
    )
  })
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npm test -- src/renderer/components/modals/NewAgentPopover.test.tsx -t "Interactive mode"`
Expected: FAIL — no radio elements yet.

- [ ] **Step 3: Add toggle state and submit field**

In `src/renderer/components/modals/NewAgentPopover.tsx`, make these edits:

1. Add the import at the top, after the existing imports:

```ts
import { NewAgentModeToggle, type NewAgentMode } from './NewAgentModeToggle'
```

2. In `NewAgentPopover`, add the state next to the other `useState` calls:

```ts
const [mode, setMode] = useState<NewAgentMode>('interactive')
```

3. Update `handleSubmit` to include `nonInteractive`:

```ts
const handleSubmit = useCallback(
  (e: React.FormEvent): void => {
    e.preventDefault()
    setLoading(true)
    onLaunch({
      projectId,
      runtimeId,
      prompt: '',
      branchName: branchName.trim() || undefined,
      ollamaModel: selectedRuntime?.needsModel ? ollamaModel : undefined,
      nonInteractive: mode === 'chat',
    })
  },
  [projectId, runtimeId, branchName, ollamaModel, selectedRuntime?.needsModel, mode, onLaunch],
)
```

4. Reset mode when the popover opens. In `useResetOnOpen`, add a setter for the mode. Simplest path: keep `useResetOnOpen` as-is and add a sibling `useEffect` next to it:

```ts
useEffect(() => {
  if (visible) setMode('interactive')
}, [visible])
```

5. Render the toggle inside the form, above the `PopoverBody`:

```tsx
<form onSubmit={handleSubmit} style={popoverStyles.panel}>
  <PopoverHeader onClose={onClose} />
  <div style={{ padding: '8px 16px 0' }}>
    <NewAgentModeToggle value={mode} onChange={setMode} />
  </div>
  <PopoverBody … />
  <PopoverFooter … />
</form>
```

- [ ] **Step 4: Run the popover tests again**

Run: `npm test -- src/renderer/components/modals/NewAgentPopover.test.tsx`
Expected: PASS (all old tests still pass, two new tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/NewAgentPopover.tsx \
        src/renderer/components/modals/NewAgentPopover.test.tsx
git commit -m "feat(modals): pass nonInteractive flag from New Agent popover"
```

---

### Task 5: Build `AgentChatView` (TDD)

**Files:**
- Create: `src/renderer/components/editor/AgentChatView.tsx`
- Create: `src/renderer/components/editor/AgentChatView.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/components/editor/AgentChatView.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { AgentChatView } from './AgentChatView'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'simple:chat-messages') return Promise.resolve([])
    if (channel === 'simple:get-agent-status') return Promise.resolve('waiting')
    return Promise.resolve(undefined)
  })
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: mockOn,
  }
})

describe('AgentChatView', () => {
  it('subscribes to chat messages for the given session', async () => {
    render(<AgentChatView sessionId="sess-1" />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('simple:chat-messages', 'sess-1')
    })
    expect(mockOn).toHaveBeenCalledWith('simple:chat-message', expect.any(Function))
  })

  it('renders the chat input', async () => {
    render(<AgentChatView sessionId="sess-1" />)
    // ChatPane renders a textarea for input — assert it's present.
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/renderer/components/editor/AgentChatView.test.tsx`
Expected: FAIL with "Cannot find module './AgentChatView'".

- [ ] **Step 3: Implement the component**

```tsx
// src/renderer/components/editor/AgentChatView.tsx
import React, { useCallback } from 'react'
import { ChatPane, useChat, useAgentStatus } from '../../../renderer-shared/chat'

interface AgentChatViewProps {
  sessionId: string
}

export function AgentChatView({ sessionId }: AgentChatViewProps): React.JSX.Element {
  const { messages, sendMessage } = useChat(sessionId)
  const { status, durationMs } = useAgentStatus(sessionId)
  const interrupt = useCallback(() => {
    void window.electronAPI.invoke('agent:interrupt', sessionId)
  }, [sessionId])

  return (
    <div style={{ height: '100%' }}>
      <ChatPane
        messages={messages}
        onSend={sendMessage}
        onInterrupt={interrupt}
        isThinking={status === 'running'}
        durationMs={durationMs}
      />
    </div>
  )
}
```

ChatPane's prop names (`messages`, `onSend`, `onInterrupt`, `isThinking`, `durationMs`) come straight from `src/renderer-shared/chat/ChatPane.tsx:118-124`. Wiring matches how Simple View's `AppView` calls `ChatPane` today.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/renderer/components/editor/AgentChatView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/editor/AgentChatView.tsx \
        src/renderer/components/editor/AgentChatView.test.tsx
git commit -m "feat(editor): add AgentChatView wrapping shared ChatPane"
```

---

### Task 6: Branch `AgentPanel` on `nonInteractive`

**Files:**
- Modify: `src/renderer/components/editor/dock-panels.tsx:83-149`

- [ ] **Step 1: Add the branch**

In `src/renderer/components/editor/dock-panels.tsx`, add the import near the top:

```ts
import { AgentChatView } from './AgentChatView'
```

In `AgentPanel`, replace the final `return <AgentTerminalView … />` block (lines ~139-148) with:

```tsx
if (targetSession?.nonInteractive) {
  return <AgentChatView sessionId={targetSessionId} />
}

return (
  <AgentTerminalView
    sessionId={targetSessionId}
    scrollbackLines={s.scrollbackLines}
    terminalFontFamily={s.terminalFontFamily}
    xtermTheme={s.xtermTheme}
    isExited={isExited}
    onRestart={handleRestart}
  />
)
```

- [ ] **Step 2: Run dock-panels tests**

Run: `npm test -- src/renderer/components/editor/dock-panels.test.tsx`
Expected: PASS (existing tests don't set `nonInteractive`, so they still hit the terminal branch).

- [ ] **Step 3: Add a test covering the chat branch**

`src/renderer/components/editor/dock-panels.test.tsx` already mocks `TerminalPane`. Mock `AgentChatView` the same way (at the top of the file, near the existing `vi.mock` calls), then add a test that flips the session to `nonInteractive: true`:

1. Near the existing `vi.mock(...)` calls (around line 15), add:

```tsx
vi.mock('./AgentChatView', () => ({
  AgentChatView: ({ sessionId }: { sessionId: string }) => (
    <div>{`chat:${sessionId}`}</div>
  ),
}))
```

2. Append a new test inside `describe('AgentPanel in superagent mode', …)`:

```tsx
it('renders AgentChatView when the target session is nonInteractive', () => {
  const AgentPanel = PANEL_COMPONENTS.agent

  render(
    <DockStateContext.Provider value={makeDockState({
      activeProjectId: 'p1',
      sessionId: 'chat-1',
      primarySessionId: 'chat-1',
      activeSuperagentId: null,
      superagents: [],
      allProjectSessions: {
        p1: [
          {
            id: 'chat-1',
            projectId: 'p1',
            runtimeId: 'claude',
            branchName: 'manifold/oslo',
            worktreePath: '/worktrees/kong-gateway/manifold-oslo',
            status: 'running',
            pid: 2,
            additionalDirs: [],
            nonInteractive: true,
          },
        ],
      },
    })}>
      <AgentPanel />
    </DockStateContext.Provider>,
  )

  expect(screen.getByText('chat:chat-1')).toBeInTheDocument()
  expect(screen.queryByText(/^terminal:Agent:/)).toBeNull()
})

it('renders terminal for interactive sessions (regression guard)', () => {
  const AgentPanel = PANEL_COMPONENTS.agent

  render(
    <DockStateContext.Provider value={makeDockState({
      activeProjectId: 'p1',
      sessionId: 'int-1',
      primarySessionId: 'int-1',
      activeSuperagentId: null,
      superagents: [],
      allProjectSessions: {
        p1: [
          {
            id: 'int-1',
            projectId: 'p1',
            runtimeId: 'claude',
            branchName: 'manifold/bergen',
            worktreePath: '/worktrees/kong-gateway/manifold-bergen',
            status: 'running',
            pid: 3,
            additionalDirs: [],
          },
        ],
      },
    })}>
      <AgentPanel />
    </DockStateContext.Provider>,
  )

  expect(screen.getByText('terminal:Agent:int-1')).toBeInTheDocument()
  expect(screen.queryByText(/^chat:/)).toBeNull()
})
```

- [ ] **Step 4: Run the test**

Run: `npm test -- src/renderer/components/editor/dock-panels.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/editor/dock-panels.tsx \
        src/renderer/components/editor/dock-panels.test.tsx
git commit -m "feat(editor): render chat view for non-interactive agent sessions"
```

---

### Task 7: Add chat glyph to agent chip in sidebar

**Files:**
- Modify: `src/renderer/components/sidebar/AgentItem.tsx:84-97`
- Modify: `src/renderer/components/sidebar/ProjectSidebar.test.tsx` (or create `AgentItem.test.tsx` if testing in isolation is cleaner)

- [ ] **Step 1: Write a failing test**

If `src/renderer/components/sidebar/AgentItem.test.tsx` does not exist, create it:

```tsx
// src/renderer/components/sidebar/AgentItem.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { AgentItem } from './AgentItem'
import type { AgentSession } from '../../../shared/types'

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    runtimeId: 'claude',
    branchName: 'manifold/oslo',
    worktreePath: '/tmp/oslo',
    status: 'running',
    pid: 1234,
    additionalDirs: [],
    ...overrides,
  }
}

describe('AgentItem chat glyph', () => {
  const baseProps = {
    projectPath: '/tmp/proj',
    isActive: false,
    isOutputting: false,
    onSelect: vi.fn(),
    onDelete: vi.fn(),
  }

  it('does not render the chat glyph for an interactive session', () => {
    render(<AgentItem {...baseProps} session={makeSession()} />)
    expect(screen.queryByLabelText('Chat agent')).not.toBeInTheDocument()
  })

  it('renders the chat glyph for a nonInteractive session', () => {
    render(<AgentItem {...baseProps} session={makeSession({ nonInteractive: true })} />)
    expect(screen.getByLabelText('Chat agent')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/renderer/components/sidebar/AgentItem.test.tsx`
Expected: FAIL on the second case — no element with that label exists yet.

- [ ] **Step 3: Render the glyph in `AgentItem.tsx`**

In `src/renderer/components/sidebar/AgentItem.tsx`, inside the `.sidebar-agent-main` div, before the `primaryLabel` span (line ~87), add:

```tsx
{session.nonInteractive && (
  <span
    aria-label="Chat agent"
    title="Chat agent"
    style={{ marginRight: 4, opacity: 0.8, fontSize: 11 }}
  >
    ◐
  </span>
)}
```

- [ ] **Step 4: Run the test again**

Run: `npm test -- src/renderer/components/sidebar/AgentItem.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/sidebar/AgentItem.tsx \
        src/renderer/components/sidebar/AgentItem.test.tsx
git commit -m "feat(sidebar): mark chat-mode agents with glyph"
```

---

### Task 8: Run the full suite and sanity-check the app

**Files:** none modified.

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: PASS for every test (pretest hook rebuilds `better-sqlite3` as documented in the testing skill).

- [ ] **Step 2: Run the app and verify by hand**

Run: `npm run dev`

In the running app:
1. Click `+ New Agent` (sidebar) → confirm an `Interactive | Chat` toggle appears at the top of the popover.
2. Leave it on Interactive → Launch → confirm the new tab shows the terminal (existing behavior).
3. `+ New Agent` again → toggle Chat → Launch → confirm the new tab shows the chat UI (same as Simple View) and the sidebar chip shows a `◐` glyph.
4. Switch between an interactive and a chat tab → confirm both panes survive the switch without crashing.
5. Open the popover from the editor header (`+ New Agent` button there) → confirm the toggle is also present (it should be — both entry points share `NewAgentPopover`).

- [ ] **Step 3: Commit if anything had to be tweaked, otherwise skip**

If sanity-checking surfaced any small fixes, commit them with a focused message. Otherwise no commit is needed for this task.

---

## Done

Chat-mode agent tabs are spawned from the existing `+ New Agent` popover and render the shared `ChatPane`. The terminal view, the title-bar Simple View toggle, and all existing backend code paths are unchanged.
