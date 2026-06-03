# First-class Workspace Creation (Two-Tier Sidebar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make creating a workspace a first-class, discoverable sidebar action and stop the New-Agent button from ejecting the user out of their active workspace.

**Architecture:** Renderer-only. The `NewWorkspaceModal`, the `workspace:create` IPC, and the `onNewWorkspace` handler (`App.tsx:211`) already exist; we re-surface them. We add a `+ New Workspace` footer button + a `+` on the "Workspaces" section header, make `+ New Agent` context-aware (spawns into the active workspace via the existing `onSpawnWorkspaceAgent` quick-spawn), and delete the buried ghost link in `OnboardingView`.

**Tech Stack:** Electron + React + TypeScript, Vitest + @testing-library/react (jsdom).

**Design doc:** `docs/superpowers/designs/2026-06-03-workspace-creation-ux-design.md`

---

## Prerequisites (read once before Task 1)

- **node_modules in this worktree:** worktrees here have no `node_modules`. If `npx vitest` / typecheck fails to resolve modules, symlink it from the main checkout: `ln -s ~/git/manifold/node_modules ./node_modules` (per the project memory + `testing` skill).
- **Run tests** with the project `testing` skill convention: `npx vitest run <file>`. The sidebar tests are pure renderer (jsdom) — no `better-sqlite3` rebuild needed.
- **Typecheck** with `npm run typecheck:web` (NOT `npm run typecheck`, which is a no-op). The web baseline has ~53 pre-existing errors; success = "no *new* errors", not zero.

---

## Task 1: First-class `+ New Workspace` footer button + context-aware `+ New Agent`

**Files:**
- Modify: `src/renderer/components/sidebar/ProjectSidebar.tsx` (props interface ~line 9-40; footer ~line 124-131)
- Modify: `src/renderer/components/editor/dock-panels.tsx:146` (forward the handler)
- Modify: `src/renderer/components/sidebar/ProjectSidebar.test-helpers.tsx:39` (add default prop)
- Test: `src/renderer/components/sidebar/ProjectSidebar.test.tsx`

- [ ] **Step 1: Add `onNewWorkspace` to the test-helpers default props**

In `src/renderer/components/sidebar/ProjectSidebar.test-helpers.tsx`, add the line right after `onNewProject: vi.fn(),` (currently line 40):

```tsx
    onNewProject: vi.fn(),
    onNewWorkspace: vi.fn(),
```

- [ ] **Step 2: Write the failing tests**

In `src/renderer/components/sidebar/ProjectSidebar.test.tsx`, add these three tests inside the `describe('ProjectSidebar', ...)` block (e.g. right after the existing `calls onNewAgent with no arguments...` test at line 113-119):

```tsx
  it('calls onNewWorkspace when the footer + New Workspace button is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('+ New Workspace'))

    expect(props.onNewWorkspace).toHaveBeenCalled()
  })

  it('labels the primary button with the active workspace and spawns into it', () => {
    const onSpawnWorkspaceAgent = vi.fn()
    const { props } = renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1'], createdAt: '2024-01-01' }],
      activeWorkspaceId: 'ws1',
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
      onSpawnWorkspaceAgent,
    })

    fireEvent.click(screen.getByText('+ New Agent in auth-refactor'))

    expect(onSpawnWorkspaceAgent).toHaveBeenCalledWith('ws1')
    expect(props.onNewAgent).not.toHaveBeenCalled()
  })

  it('keeps the plain + New Agent label and handler when no workspace is active', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('+ New Agent'))

    expect(props.onNewAgent).toHaveBeenCalled()
  })
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/renderer/components/sidebar/ProjectSidebar.test.tsx`
Expected: FAIL — `Unable to find an element with the text: + New Workspace` and `+ New Agent in auth-refactor` (those elements don't exist yet).

- [ ] **Step 4: Add the `onNewWorkspace` prop to ProjectSidebar**

In `src/renderer/components/sidebar/ProjectSidebar.tsx`, add to the `ProjectSidebarProps` interface right after `onNewProject: () => void` (line 22):

```tsx
  onNewProject: () => void
  onNewWorkspace?: () => void
```

And add to the destructured params right after `onNewProject,` (line 55):

```tsx
  onNewProject,
  onNewWorkspace,
```

- [ ] **Step 5: Compute the active workspace and replace the footer**

In `src/renderer/components/sidebar/ProjectSidebar.tsx`, just before the `return (` (after the `handleRemove` useCallback, ~line 80), add:

```tsx
  const activeWorkspace = activeWorkspaceId
    ? workspaces?.find((w) => w.id === activeWorkspaceId)
    : undefined
```

Then replace the footer block (currently lines 124-131):

```tsx
      <div style={sidebarStyles.actions}>
        <button type="button" onClick={onNewAgent} className="sidebar-action-button sidebar-action-button--primary" style={sidebarStyles.actionButtonPrimary}>
          + New Agent
        </button>
        <button type="button" onClick={onNewProject} className="sidebar-action-button" style={sidebarStyles.actionButton}>
          + New Repository
        </button>
      </div>
```

with:

```tsx
      <div style={{ ...sidebarStyles.actions, flexDirection: 'column' }}>
        <button
          type="button"
          onClick={() => {
            if (activeWorkspace && onSpawnWorkspaceAgent) onSpawnWorkspaceAgent(activeWorkspace.id)
            else onNewAgent()
          }}
          className="sidebar-action-button sidebar-action-button--primary"
          style={{ ...sidebarStyles.actionButtonPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'var(--control-height)', overflow: 'hidden' }}
          title={activeWorkspace ? `New agent in ${activeWorkspace.name}` : 'New agent'}
        >
          <span className="truncate">{activeWorkspace ? `+ New Agent in ${activeWorkspace.name}` : '+ New Agent'}</span>
        </button>
        <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
          <button type="button" onClick={() => onNewWorkspace?.()} className="sidebar-action-button" style={sidebarStyles.actionButton}>
            + New Workspace
          </button>
          <button type="button" onClick={onNewProject} className="sidebar-action-button" style={sidebarStyles.actionButton}>
            + New Repository
          </button>
        </div>
      </div>
```

- [ ] **Step 6: Forward the handler from dock-panels**

In `src/renderer/components/editor/dock-panels.tsx`, add the prop right after `onNewProject={s.onNewProject}` (line 146):

```tsx
      onNewProject={s.onNewProject}
      onNewWorkspace={s.onNewWorkspace}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/renderer/components/sidebar/ProjectSidebar.test.tsx`
Expected: PASS — all tests green, including the three new ones and the pre-existing `+ New Agent` / `+ New Repository` tests.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/sidebar/ProjectSidebar.tsx src/renderer/components/editor/dock-panels.tsx src/renderer/components/sidebar/ProjectSidebar.test.tsx src/renderer/components/sidebar/ProjectSidebar.test-helpers.tsx
git commit -m "feat(sidebar): first-class New Workspace button + workspace-aware New Agent"
```

---

## Task 2: `+` on the "Workspaces" section header

**Files:**
- Modify: `src/renderer/components/sidebar/WorkspaceList.tsx` (props ~line 7-21; header ~line 61-62)
- Modify: `src/renderer/components/sidebar/ProjectSidebar.tsx` (pass `onNewWorkspace` into `<WorkspaceList>` ~line 85-99)
- Test: `src/renderer/components/sidebar/ProjectSidebar.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/renderer/components/sidebar/ProjectSidebar.test.tsx`, add inside the `describe` block:

```tsx
  it('renders a + on the Workspaces header that calls onNewWorkspace', () => {
    const { props } = renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1'], createdAt: '2024-01-01' }],
      activeWorkspaceId: 'ws1',
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
      onSpawnWorkspaceAgent: vi.fn(),
    })

    fireEvent.click(screen.getByLabelText('New workspace'))

    expect(props.onNewWorkspace).toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/components/sidebar/ProjectSidebar.test.tsx -t "Workspaces header"`
Expected: FAIL — `Unable to find a label with the text of: New workspace`.

- [ ] **Step 3: Add the `onNewWorkspace` prop to WorkspaceList**

In `src/renderer/components/sidebar/WorkspaceList.tsx`, add to `WorkspaceListProps` right after `onDeleteAgent?: ...` (line 20):

```tsx
  onDeleteAgent?: (session: AgentSession, projectPath: string) => void
  onNewWorkspace?: () => void
```

And add to the destructured params right after `onDeleteAgent,` (line 36):

```tsx
  onDeleteAgent,
  onNewWorkspace,
```

- [ ] **Step 4: Render the header `+` button**

In `src/renderer/components/sidebar/WorkspaceList.tsx`, replace the section-label line (currently line 62):

```tsx
      <div style={sidebarStyles.sectionLabel}>Workspaces</div>
```

with:

```tsx
      <div style={{ ...sidebarStyles.sectionLabel, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Workspaces</span>
        {onNewWorkspace && (
          <button
            type="button"
            onClick={onNewWorkspace}
            className="sidebar-icon-button"
            style={sidebarStyles.addButton}
            aria-label="New workspace"
            title="New workspace"
          >
            +
          </button>
        )}
      </div>
```

- [ ] **Step 5: Pass `onNewWorkspace` into `<WorkspaceList>`**

In `src/renderer/components/sidebar/ProjectSidebar.tsx`, add the prop to the `<WorkspaceList ... />` element right after `onDeleteAgent={onRequestDeleteAgent}` (line 98):

```tsx
          onDeleteAgent={onRequestDeleteAgent}
          onNewWorkspace={onNewWorkspace}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/renderer/components/sidebar/ProjectSidebar.test.tsx`
Expected: PASS — the new "Workspaces header" test plus all existing tests.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/sidebar/WorkspaceList.tsx src/renderer/components/sidebar/ProjectSidebar.tsx src/renderer/components/sidebar/ProjectSidebar.test.tsx
git commit -m "feat(sidebar): add + affordance to the Workspaces section header"
```

---

## Task 3: Remove the buried `+ New Workspace` ghost link

**Files:**
- Modify: `src/renderer/components/modals/OnboardingView.tsx` (remove prop line 84; remove link lines 160-162)
- Modify: `src/renderer/components/editor/dock-agent-panel.tsx:146` (remove pass-through)

> This is a pure deletion. The compiler enforces correctness (removing the `OnboardingView` prop forces removing the `dock-agent-panel` pass-through, or `typecheck:web` errors), so verification is typecheck + grep rather than a new render test. `GhostLinkButton` and `onboardingLinkStyle` stay — still used by the `no-project` "Back to workspace" link (line 132).

- [ ] **Step 1: Remove the ghost link from OnboardingView**

In `src/renderer/components/modals/OnboardingView.tsx`, delete these lines (160-162):

```tsx
          {props.onNewWorkspace && (
            <GhostLinkButton onClick={props.onNewWorkspace}>+ New Workspace</GhostLinkButton>
          )}
```

- [ ] **Step 2: Remove the now-unused prop from the NoAgentProps interface**

In the same file, delete this line from `NoAgentProps` (line 84):

```tsx
  onNewWorkspace?: () => void
```

- [ ] **Step 3: Remove the pass-through in dock-agent-panel**

In `src/renderer/components/editor/dock-agent-panel.tsx`, delete this line (146):

```tsx
        onNewWorkspace={s.onNewWorkspace}
```

- [ ] **Step 4: Verify the link is gone and types are consistent**

Run: `git grep -n "New Workspace" src/renderer/components/modals/OnboardingView.tsx`
Expected: no output (the string is gone).

Run: `npm run typecheck:web`
Expected: no *new* errors versus the ~53-error web baseline — specifically no error mentioning `onNewWorkspace` in `OnboardingView.tsx` or `dock-agent-panel.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/OnboardingView.tsx src/renderer/components/editor/dock-agent-panel.tsx
git commit -m "refactor(onboarding): remove buried + New Workspace link (now in the sidebar)"
```

---

## Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full sidebar test file**

Run: `npx vitest run src/renderer/components/sidebar/ProjectSidebar.test.tsx`
Expected: PASS — all tests, including the 4 added across Tasks 1-2 and every pre-existing test.

- [ ] **Step 2: Typecheck the web bundle**

Run: `npm run typecheck:web`
Expected: no new errors versus baseline (~53). If a new error appears, fix it before proceeding.

- [ ] **Step 3 (manual, during review): Visual smoke check**

Launch the app (project `run` skill). Confirm:
1. With zero workspaces: the footer shows `+ New Agent` (top), then `+ New Workspace` and `+ New Repository` side by side; clicking `+ New Workspace` opens the modal directly.
2. Create a workspace, select it: the primary button reads `+ New Agent in {name}`; clicking it spawns an agent in that workspace and the workspace stays selected.
3. The "Workspaces" header shows a `+` that opens the modal; single-repo (no workspace) users see no empty Workspaces section.
4. The New-Agent onboarding view no longer shows a `+ New Workspace` link.

---

## Self-review notes

- **Spec coverage:** Section 1 → Tasks 1 (footer) + 2 (header); Section 2 (context-aware New Agent / no-eject) → Task 1; Section 3 (remove ghost link) → Task 3. Non-goals (no IPC/main/data-model/form changes) respected — all touched files are under `src/renderer`.
- **Type consistency:** `onNewWorkspace?: () => void` is added identically to `ProjectSidebarProps` and `WorkspaceListProps`, removed from `NoAgentProps`; `onSpawnWorkspaceAgent(workspaceId)` matches its existing signature `(workspaceId: string, homeProjectId?: string) => void` (homeProjectId omitted → primary repo).
- **Footer layout:** the `actions` flex container is switched to a column (primary row + a secondary two-button row) so three actions don't get crushed at typical sidebar widths; the primary button gets explicit `height`/centering since `actionButtonPrimary` has no intrinsic height outside a row.
