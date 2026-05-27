# Chat-mode Deferred Spawn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chat-mode agent tab actually functional by deferring session spawn until the user's first message. Submitting the New Agent popover in Chat mode creates a renderer-side "draft chat" placeholder. The first send promotes the draft into a real `nonInteractive` session with the typed text as the initial prompt.

**Architecture:** A new `useDraftChats` hook owns an in-memory `DraftChat[]` keyed by synthetic IDs (`draft-<uuid>`). The popover's `onLaunch` is intercepted in `App.tsx`: if `nonInteractive` is true, route to `createDraft` (and set active to the draft id) instead of `spawnAgent`. The sidebar renders drafts via a new `DraftAgentItem` component alongside `AgentItem`. `AgentPanel` checks for an active draft before falling through to session branches; when present, it renders a new `DraftChatView` (empty `ChatPane` with input enabled). First send calls `promoteDraft`, which `spawnAgent`s with the message as prompt, `simple:subscribe-chat`s the new session id, sets it active, and discards the draft.

**Tech Stack:** TypeScript, React hooks, Vitest + @testing-library/react, Electron IPC.

---

## File Map

**Create**
- `src/renderer/hooks/useDraftChats.ts`
- `src/renderer/hooks/useDraftChats.test.ts`
- `src/renderer/components/sidebar/DraftAgentItem.tsx`
- `src/renderer/components/sidebar/DraftAgentItem.test.tsx`
- `src/renderer/components/editor/DraftChatView.tsx`
- `src/renderer/components/editor/DraftChatView.test.tsx`
- `src/shared/draft-chat.ts` — `DraftChat` interface (kept in `src/shared` because both renderer hooks and dock-state types reference it)

**Modify**
- `src/renderer/App.tsx` — instantiate `useDraftChats`, intercept popover launches, derive `activeDraft`, pass `promoteDraft` + `discardDraft` + `drafts` into dock state and sidebar.
- `src/renderer/hooks/useAppOverlays.ts` — accept and forward a `createDraftChat` callback alongside `spawnAgent`; route `handleLaunchAgent` based on `nonInteractive`.
- `src/renderer/components/sidebar/ProjectSidebar.tsx` — render `DraftAgentItem` entries for the active project alongside `AgentItem`.
- `src/renderer/components/sidebar/ProjectSidebar.styles.ts` — small style for draft row.
- `src/renderer/components/editor/dock-panel-types.ts` — add `activeDraft`, `promoteDraft`, `discardDraft`, `drafts` to `DockAppState`.
- `src/renderer/components/editor/dock-panels.tsx` — branch `AgentPanel` on `activeDraft` before existing branches.
- `src/renderer/components/editor/dock-panels.test.tsx` — extend `makeDockState` defaults; add tests for the draft branch.

**Run tests with:** `npm test -- <path>` (per `.codex/skills/testing/SKILL.md`; never `npx vitest run`).

---

### Task 9: `DraftChat` type + `useDraftChats` hook (TDD)

**Files:**
- Create: `src/shared/draft-chat.ts`
- Create: `src/renderer/hooks/useDraftChats.ts`
- Create: `src/renderer/hooks/useDraftChats.test.ts`

- [ ] **Step 1: Write the `DraftChat` type**

```ts
// src/shared/draft-chat.ts
export interface DraftChat {
  id: string
  projectId: string
  runtimeId: string
  branchName?: string
  ollamaModel?: string
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/renderer/hooks/useDraftChats.test.ts
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDraftChats } from './useDraftChats'

describe('useDraftChats', () => {
  it('starts with no drafts', () => {
    const { result } = renderHook(() => useDraftChats())
    expect(result.current.drafts).toEqual([])
  })

  it('creates a draft and returns it with a synthetic id', () => {
    const { result } = renderHook(() => useDraftChats())
    let created!: ReturnType<typeof result.current.createDraft>
    act(() => {
      created = result.current.createDraft({
        projectId: 'p1',
        runtimeId: 'claude',
        branchName: 'manifold/oslo',
      })
    })
    expect(created.id).toMatch(/^draft-/)
    expect(result.current.drafts).toHaveLength(1)
    expect(result.current.drafts[0]).toEqual(created)
  })

  it('discards a draft by id', () => {
    const { result } = renderHook(() => useDraftChats())
    let id = ''
    act(() => {
      id = result.current.createDraft({ projectId: 'p1', runtimeId: 'claude' }).id
    })
    act(() => result.current.discardDraft(id))
    expect(result.current.drafts).toEqual([])
  })

  it('discardDraft on an unknown id is a no-op', () => {
    const { result } = renderHook(() => useDraftChats())
    act(() => {
      result.current.createDraft({ projectId: 'p1', runtimeId: 'claude' })
    })
    act(() => result.current.discardDraft('does-not-exist'))
    expect(result.current.drafts).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npm test -- src/renderer/hooks/useDraftChats.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the hook**

```ts
// src/renderer/hooks/useDraftChats.ts
import { useCallback, useState } from 'react'
import type { DraftChat } from '../../shared/draft-chat'

export interface UseDraftChatsResult {
  drafts: DraftChat[]
  createDraft: (opts: Omit<DraftChat, 'id'>) => DraftChat
  discardDraft: (id: string) => void
}

export function useDraftChats(): UseDraftChatsResult {
  const [drafts, setDrafts] = useState<DraftChat[]>([])

  const createDraft = useCallback((opts: Omit<DraftChat, 'id'>): DraftChat => {
    const draft: DraftChat = { id: `draft-${crypto.randomUUID()}`, ...opts }
    setDrafts((prev) => [...prev, draft])
    return draft
  }, [])

  const discardDraft = useCallback((id: string): void => {
    setDrafts((prev) => prev.filter((d) => d.id !== id))
  }, [])

  return { drafts, createDraft, discardDraft }
}
```

- [ ] **Step 5: Run tests again**

Run: `npm test -- src/renderer/hooks/useDraftChats.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 6: Commit**

```bash
git add src/shared/draft-chat.ts src/renderer/hooks/useDraftChats.ts src/renderer/hooks/useDraftChats.test.ts
git commit -m "feat(chat): add DraftChat type and useDraftChats hook"
```

---

### Task 10: Build `DraftAgentItem` (TDD) and render it in the sidebar

**Files:**
- Create: `src/renderer/components/sidebar/DraftAgentItem.tsx`
- Create: `src/renderer/components/sidebar/DraftAgentItem.test.tsx`
- Modify: `src/renderer/components/sidebar/ProjectSidebar.tsx`
- Modify: `src/renderer/components/sidebar/ProjectSidebar.test.tsx`

- [ ] **Step 1: Failing test for the component**

```tsx
// src/renderer/components/sidebar/DraftAgentItem.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { DraftAgentItem } from './DraftAgentItem'

const draft = {
  id: 'draft-1',
  projectId: 'p1',
  runtimeId: 'claude',
  branchName: 'manifold/oslo',
}

describe('DraftAgentItem', () => {
  it('renders the "New chat" label and the chat glyph', () => {
    render(
      <DraftAgentItem
        draft={draft}
        isActive={false}
        onSelect={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.getByText('New chat')).toBeInTheDocument()
    expect(screen.getByLabelText('Chat agent')).toBeInTheDocument()
  })

  it('calls onSelect with draft id when clicked', () => {
    const onSelect = vi.fn()
    render(
      <DraftAgentItem draft={draft} isActive={false} onSelect={onSelect} onDiscard={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('New chat'))
    expect(onSelect).toHaveBeenCalledWith('draft-1')
  })

  it('calls onDiscard when the delete button is clicked', () => {
    const onDiscard = vi.fn()
    render(
      <DraftAgentItem draft={draft} isActive={false} onSelect={vi.fn()} onDiscard={onDiscard} />,
    )
    fireEvent.click(screen.getByLabelText(/Discard draft/i))
    expect(onDiscard).toHaveBeenCalledWith('draft-1')
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- src/renderer/components/sidebar/DraftAgentItem.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the component**

Mirror the styles `AgentItem` uses so the row looks consistent.

```tsx
// src/renderer/components/sidebar/DraftAgentItem.tsx
import React, { useCallback } from 'react'
import type { DraftChat } from '../../../shared/draft-chat'
import { sidebarStyles } from './ProjectSidebar.styles'

interface DraftAgentItemProps {
  draft: DraftChat
  isActive: boolean
  onSelect: (id: string) => void
  onDiscard: (id: string) => void
}

export function DraftAgentItem({ draft, isActive, onSelect, onDiscard }: DraftAgentItemProps): React.JSX.Element {
  const handleClick = useCallback(() => onSelect(draft.id), [onSelect, draft.id])
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onSelect(draft.id)
      }
    },
    [onSelect, draft.id],
  )
  const handleDelete = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation()
      onDiscard(draft.id)
    },
    [onDiscard, draft.id],
  )

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`sidebar-item-row sidebar-agent-row sidebar-agent-row--alive${isActive ? ' sidebar-item-row--active' : ''}`}
      title="Draft chat"
      role="button"
      tabIndex={0}
    >
      <div className="sidebar-agent-main">
        <span className="status-dot status-dot--hidden" />
        <span
          aria-label="Chat agent"
          title="Chat agent"
          style={{ marginRight: 4, opacity: 0.8, fontSize: 11 }}
        >
          ◐
        </span>
        <span
          className="truncate sidebar-row-label"
          style={{
            ...sidebarStyles.agentBranch,
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: isActive ? 600 : 400,
            fontStyle: 'italic',
            flex: 1,
          }}
        >
          New chat
        </span>
        <div className="sidebar-item-actions">
          <button
            type="button"
            onClick={handleDelete}
            className="sidebar-icon-button"
            style={sidebarStyles.agentDeleteButton}
            aria-label={`Discard draft ${draft.id}`}
            title="Discard draft"
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run component tests**

Run: `npm test -- src/renderer/components/sidebar/DraftAgentItem.test.tsx`
Expected: PASS (3 cases).

- [ ] **Step 5: Render drafts in `ProjectSidebar`**

In `src/renderer/components/sidebar/ProjectSidebar.tsx`:

1. Extend the component props (around line 30) with:
```ts
drafts: DraftChat[]
activeDraftId: string | null
onSelectDraft: (id: string) => void
onDiscardDraft: (id: string) => void
```

2. Import:
```ts
import type { DraftChat } from '../../../shared/draft-chat'
import { DraftAgentItem } from './DraftAgentItem'
```

3. Destructure the new props alongside the existing ones (around line 57).

4. Inside the active-project block (after the `primarySessions.map(...)` block that ends around line 267), append:
```tsx
{drafts
  .filter((d) => d.projectId === activeProject.id)
  .map((d) => (
    <DraftAgentItem
      key={d.id}
      draft={d}
      isActive={d.id === activeDraftId}
      onSelect={onSelectDraft}
      onDiscard={onDiscardDraft}
    />
  ))}
```

- [ ] **Step 6: Update `ProjectSidebar.test.tsx`**

`ProjectSidebar.test.tsx` already constructs default props for the sidebar. Add the four new props with sensible defaults to every `defaultProps`/setup block:
```ts
drafts: [],
activeDraftId: null,
onSelectDraft: vi.fn(),
onDiscardDraft: vi.fn(),
```

Find every occurrence:
```bash
grep -n "onNewAgent" src/renderer/components/sidebar/ProjectSidebar.test.tsx
```
For each setup block, add the four defaults.

Add one new test case:
```tsx
it('renders a draft chat row when drafts are present for the active project', () => {
  const props = { ...defaultProps(), drafts: [{ id: 'draft-1', projectId: 'p1', runtimeId: 'claude' }] }
  // ...render with these props; adjust to match the file's helper pattern.
  // Assert: screen.getByText('New chat') is in the document.
})
```
(Use whatever rendering helper the existing tests use; mirror that pattern.)

- [ ] **Step 7: Run sidebar tests**

Run: `npm test -- src/renderer/components/sidebar/`
Expected: PASS — existing tests plus the new draft case.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/sidebar/DraftAgentItem.tsx \
        src/renderer/components/sidebar/DraftAgentItem.test.tsx \
        src/renderer/components/sidebar/ProjectSidebar.tsx \
        src/renderer/components/sidebar/ProjectSidebar.test.tsx
git commit -m "feat(sidebar): render draft chat tabs"
```

---

### Task 11: Build `DraftChatView` (TDD)

**Files:**
- Create: `src/renderer/components/editor/DraftChatView.tsx`
- Create: `src/renderer/components/editor/DraftChatView.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
// src/renderer/components/editor/DraftChatView.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { DraftChatView } from './DraftChatView'

describe('DraftChatView', () => {
  it('renders an empty chat with input enabled', () => {
    render(<DraftChatView onFirstSend={vi.fn()} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('calls onFirstSend with the typed text when the user submits', () => {
    const onFirstSend = vi.fn()
    render(<DraftChatView onFirstSend={onFirstSend} />)
    const textbox = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textbox, { target: { value: 'hello' } })
    fireEvent.keyDown(textbox, { key: 'Enter' })
    expect(onFirstSend).toHaveBeenCalledWith('hello')
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- src/renderer/components/editor/DraftChatView.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// src/renderer/components/editor/DraftChatView.tsx
import React from 'react'
import { ChatPane } from '../../../renderer-shared/chat'

interface DraftChatViewProps {
  onFirstSend: (text: string) => void
}

export function DraftChatView({ onFirstSend }: DraftChatViewProps): React.JSX.Element {
  return (
    <div style={{ height: '100%' }}>
      <ChatPane
        messages={[]}
        onSend={onFirstSend}
        isThinking={false}
        durationMs={null}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/renderer/components/editor/DraftChatView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/editor/DraftChatView.tsx \
        src/renderer/components/editor/DraftChatView.test.tsx
git commit -m "feat(editor): add DraftChatView for unsent chat tabs"
```

---

### Task 12: Wire draft state into `App.tsx`, overlays, and dock state

**Files:**
- Modify: `src/renderer/hooks/useAppOverlays.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/editor/dock-panel-types.ts`
- Modify: `src/renderer/components/editor/dock-panels.tsx`
- Modify: `src/renderer/components/editor/dock-panels.test.tsx`

- [ ] **Step 1: Add draft props to `DockAppState`**

In `src/renderer/components/editor/dock-panel-types.ts`, add to the `DockAppState` interface:
```ts
import type { DraftChat } from '../../../shared/draft-chat'

// inside DockAppState:
drafts: DraftChat[]
activeDraft: DraftChat | null
promoteDraft: (draftId: string, firstMessage: string) => Promise<void>
discardDraft: (draftId: string) => void
```

- [ ] **Step 2: Extend `useAppOverlays` to route launches**

In `src/renderer/hooks/useAppOverlays.ts`:

1. Add `createDraftChat` to the function signature (after `spawnAgent`):
```ts
export function useAppOverlays(
  commit: (message: string) => Promise<void>,
  refreshDiff: () => Promise<void>,
  spawnAgent: (options: SpawnAgentOptions) => Promise<unknown>,
  createDraftChat: (opts: { projectId: string; runtimeId: string; branchName?: string; ollamaModel?: string }) => { id: string },
  deleteAgent: (sessionId: string, mode?: 'session' | 'worktree') => Promise<void>,
  // ... rest unchanged
)
```

2. Replace `handleLaunchAgent`:
```ts
const handleLaunchAgent = useCallback((options: SpawnAgentOptions): Promise<unknown> => {
  if (options.nonInteractive) {
    const draft = createDraftChat({
      projectId: options.projectId,
      runtimeId: options.runtimeId,
      branchName: options.branchName,
      ollamaModel: options.ollamaModel,
    })
    setActiveSession(draft.id)
    return Promise.resolve(draft)
  }
  return spawnAgent(options)
}, [spawnAgent, createDraftChat, setActiveSession])
```

- [ ] **Step 3: Wire `useDraftChats` in `App.tsx`**

In `src/renderer/App.tsx`:

1. Import:
```ts
import { useDraftChats } from './hooks/useDraftChats'
```

2. Near the `useAgentSession` call (line 74), add:
```ts
const { drafts, createDraft, discardDraft } = useDraftChats()
const activeDraft = drafts.find((d) => d.id === activeSessionId) ?? null
```

3. Pass `createDraft` into `useAppOverlays` (line 267). It becomes the new third argument.

4. Define `promoteDraft`:
```ts
const promoteDraft = useCallback(async (draftId: string, firstMessage: string): Promise<void> => {
  const draft = drafts.find((d) => d.id === draftId)
  if (!draft) return
  const session = await spawnAgent({
    projectId: draft.projectId,
    runtimeId: draft.runtimeId,
    prompt: firstMessage,
    userMessage: firstMessage,
    branchName: draft.branchName,
    ollamaModel: draft.ollamaModel,
    nonInteractive: true,
  })
  discardDraft(draftId)
  if (session) {
    await window.electronAPI.invoke('simple:subscribe-chat', session.id)
    setActiveSession(session.id)
  }
}, [drafts, spawnAgent, discardDraft, setActiveSession])
```

5. Pass `drafts`, `activeDraft`, `promoteDraft`, `discardDraft` through the dock state object (the big object built around line 466 onward — search for `onLaunchAgent: overlays.handleLaunchAgent`):
```ts
drafts,
activeDraft,
promoteDraft,
discardDraft,
```

6. Pass `drafts`, `activeDraftId: activeDraft?.id ?? null`, `onSelectDraft: setActiveSession`, `onDiscardDraft: discardDraft` to `ProjectSidebar`. Find the `ProjectSidebar` invocation in App.tsx (or wherever it is — `grep -n "ProjectSidebar" src/renderer/App.tsx src/renderer/components/editor/dock-panels.tsx`) and add the props there.

- [ ] **Step 4: Branch `AgentPanel` on `activeDraft`**

In `src/renderer/components/editor/dock-panels.tsx`:

1. Add import:
```ts
import { DraftChatView } from './DraftChatView'
```

2. In `AgentPanel`, near the top after `s.activeSuperagentId` check (around line 109), add:
```ts
if (s.activeDraft) {
  return (
    <DraftChatView
      onFirstSend={(text) => { void s.promoteDraft(s.activeDraft!.id, text) }}
    />
  )
}
```

(`s.activeDraft!` is safe because of the truthy check.)

- [ ] **Step 5: Update `dock-panels.test.tsx`**

The `makeDockState` factory needs defaults for the four new fields. Open `src/renderer/components/editor/dock-panels.test.tsx` and, inside `makeDockState`, add:
```ts
drafts: [],
activeDraft: null,
promoteDraft: vi.fn(async () => {}),
discardDraft: vi.fn(),
```

Add one new test case inside the existing `describe('AgentPanel in superagent mode', ...)`:
```tsx
it('renders DraftChatView when an activeDraft is set', () => {
  const AgentPanel = PANEL_COMPONENTS.agent

  render(
    <DockStateContext.Provider value={makeDockState({
      activeProjectId: 'p1',
      activeSuperagentId: null,
      superagents: [],
      activeDraft: { id: 'draft-1', projectId: 'p1', runtimeId: 'claude', branchName: 'manifold/oslo' },
    })}>
      <AgentPanel />
    </DockStateContext.Provider>,
  )

  expect(screen.getByRole('textbox')).toBeInTheDocument()
})
```

(`DraftChatView` is not mocked here — the real component rendering an empty `ChatPane` is what we want to verify.)

- [ ] **Step 6: Run all renderer tests**

Run: `npm test -- src/renderer`
Expected: PASS — all existing tests plus the new draft case.

If any existing tests fail because they construct `DockAppState` literally and now lack the four new fields, fix them by adding the same defaults (`drafts: []`, `activeDraft: null`, `promoteDraft: vi.fn()`, `discardDraft: vi.fn()`).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/App.tsx \
        src/renderer/hooks/useAppOverlays.ts \
        src/renderer/components/editor/dock-panel-types.ts \
        src/renderer/components/editor/dock-panels.tsx \
        src/renderer/components/editor/dock-panels.test.tsx
git commit -m "feat(chat): route chat-mode launches to drafts and promote on first send"
```

---

### Task 13: Full suite + hand verification

**Files:** none modified unless something must be tweaked.

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — 179+ files, all green.

If any test broke because of the `DockAppState` widening, fix by adding the four default fields (`drafts`, `activeDraft`, `promoteDraft`, `discardDraft`) to its dock-state mock factory.

- [ ] **Step 2: Hand-verify in the running app**

Run: `npm run dev`

Verify:
1. `+ New Agent` → toggle Chat → Launch → a "New chat" row appears in the sidebar with the `◐` glyph; the agent panel shows an empty chat with an enabled input.
2. Type a first message and submit → the draft row disappears, a real agent row appears with the branch name, and the chat shows the user message + Claude's streamed response.
3. Open another `+ New Agent` → Interactive → Launch → terminal session works as before (no regression).
4. Create a draft, hit its `×` in the sidebar → the draft disappears, no orphan tab.

- [ ] **Step 3: If anything had to be tweaked, commit**

If sanity-checking surfaced any fixes, commit them with a focused message. Otherwise no commit.

---

## Done

Chat-mode tabs spawn deferred sessions that materialize on first message, matching the proven Simple-View IPC contract (`prompt` set at spawn + `simple:subscribe-chat` immediately after). The terminal flow is untouched.
