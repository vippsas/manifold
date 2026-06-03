# Create Workspace Agents via the New-Agent Form — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-repo ▶ quick-spawn inside a workspace with the New-Agent form: select a repo → "+ New Agent" → trimmed form (name + AI + Interactive/Chat) → Start spawns the same multi-root workspace agent the ▶ produced, with the chosen runtime/name/mode.

**Architecture:** Renderer routes the existing New-Agent form into the existing workspace spawn path. A workspace repo becomes selectable (sets `activeProjectId` + `activeWorkspaceId`, clears the session); the agent panel renders the form in a trimmed "workspace mode" whose Start Agent calls the workspace spawn instead of the standalone one. One small main-process change carries the Interactive/Chat choice through.

**Tech Stack:** Electron + React + TypeScript, Vitest + @testing-library/react.

**Design doc:** `docs/superpowers/designs/2026-06-03-workspace-agent-creation-design.md`

## Prerequisites

- node_modules in this worktree (symlinked from `~/git/manifold`).
- Renderer tests: `npx vitest run <file>`. Main tests touch `better-sqlite3` — run them with the project `testing` skill convention (rebuild only if a suite needs it; `workspace-manager.test.ts` is pure logic).
- Typecheck: `npm run typecheck:web` and `npm run typecheck:node` (NOT `npm run typecheck`). Baselines are non-zero (~53 web / ~21 node); success = no *new* errors.

## File structure / what changes

- `src/shared/workspace-types.ts` — `WorkspaceSpawnAgentOptions` gains `nonInteractive?`.
- `src/main/workspace/workspace-manager.ts` — forward `nonInteractive` to `createSession`.
- `src/renderer/App.tsx` — extend `onSpawnWorkspaceAgent` to accept launch opts; add `onSelectWorkspaceRepo`; make `onNewAgentFromHeader` workspace-aware; add `onLaunchWorkspaceAgent` to the dock state.
- `src/renderer/components/editor/dock-panel-types.ts` — type the new/extended dock-state fields.
- `src/renderer/components/modals/NewAgentForm.tsx` — add `compact` (workspace) mode: promote the AI picker, drop resume/Advanced.
- `src/renderer/components/modals/OnboardingView.tsx` — pass `compact` + a workspace `onLaunch` through.
- `src/renderer/components/editor/dock-agent-panel.tsx` — when the active repo is in the active workspace, render the form in compact mode wired to the workspace launch.
- `src/renderer/components/sidebar/WorkspaceList.tsx` — remove ▶; make repo rows selectable + highlight the selected one.
- `src/renderer/components/sidebar/ProjectSidebar.tsx` — thread `onSelectWorkspaceRepo` + `activeProjectId`; footer "+ New Agent" no longer quick-spawns.

---

## Task 1: Carry Interactive/Chat through the workspace spawn (main)

**Files:**
- Modify: `src/shared/workspace-types.ts` (`WorkspaceSpawnAgentOptions`, ~line 18-24)
- Modify: `src/main/workspace/workspace-manager.ts` (`spawnAgent`, the `createSession` call ~line 95-105)
- Test: `src/main/workspace/workspace-manager.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/main/workspace/workspace-manager.test.ts` (inside the existing `describe` for `spawnAgent`; mirror the existing spawnAgent test's setup for `deps`/mocks):

```ts
  it('forwards nonInteractive to createSession', async () => {
    const created: any[] = []
    const manager = makeManager({ createSession: async (opts: any) => { created.push(opts); return { id: 's1', projectId: opts.projectId } } })
    await manager.spawnAgent('ws1', { runtimeId: 'claude', nonInteractive: true })
    expect(created[0].nonInteractive).toBe(true)
  })
```

If the test file uses a different helper than `makeManager`, reuse whatever the existing `spawnAgent` test uses to construct the manager + capture the `createSession` call; the assertion is `created[0].nonInteractive === true`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/main/workspace/workspace-manager.test.ts -t "nonInteractive"`
Expected: FAIL — `createSession` received `nonInteractive: undefined`.

- [ ] **Step 3: Add the field to the options type**

In `src/shared/workspace-types.ts`, add to `WorkspaceSpawnAgentOptions` (after `homeProjectId`):

```ts
  /** Repo to use as the agent cwd/primary; defaults to the first repo when absent or unknown. */
  homeProjectId?: string
  /** When true, launch in non-interactive (Chat) mode; mirrors SpawnAgentOptions.nonInteractive. */
  nonInteractive?: boolean
```

- [ ] **Step 4: Forward it in the manager**

In `src/main/workspace/workspace-manager.ts`, in the `createSession` call inside `spawnAgent`, add the field:

```ts
    return this.deps.sessionManager.createSession({
      projectId: projects[0].id,
      runtimeId: options.runtimeId,
      prompt: options.prompt ?? '',
      branchName,
      existingWorktreePath: primary,
      additionalDirs,
      workspaceId,
      workspaceWorktreePaths: worktreePaths,
      nonInteractive: options.nonInteractive,
    })
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/main/workspace/workspace-manager.test.ts`
Expected: PASS (all tests, including the new one).

- [ ] **Step 6: Typecheck node**

Run: `npm run typecheck:node`
Expected: no new errors vs baseline. (If `createSession`'s param type doesn't accept `nonInteractive`, confirm it already does — `SpawnAgentOptions`/the session-creator input includes `nonInteractive`; the standalone path sets it. If the manager's `createSession` input type is narrower, widen it to include `nonInteractive?: boolean`.)

- [ ] **Step 7: Commit**

```bash
git add src/shared/workspace-types.ts src/main/workspace/workspace-manager.ts src/main/workspace/workspace-manager.test.ts
git commit -m "feat(workspace): carry Interactive/Chat mode through workspace spawn"
```

---

## Task 2: Extend `onSpawnWorkspaceAgent` to accept launch options (renderer)

**Files:**
- Modify: `src/renderer/hooks/useWorkspaces.ts` (the `WorkspaceSpawnAgentOptions` passthrough already exists — no change unless typed inline)
- Modify: `src/renderer/App.tsx` (`onSpawnWorkspaceAgent`, line 217-221; add `onLaunchWorkspaceAgent`)
- Modify: `src/renderer/components/editor/dock-panel-types.ts` (extend `onSpawnWorkspaceAgent` signature; add `onLaunchWorkspaceAgent`)

- [ ] **Step 1: Extend the App handler**

In `src/renderer/App.tsx`, replace the `onSpawnWorkspaceAgent` handler (lines 217-221) with one that takes optional launch fields, and add a form-shaped `onLaunchWorkspaceAgent` next to it:

```ts
    onSpawnWorkspaceAgent: async (
      workspaceId: string,
      homeProjectId?: string,
      opts?: { runtimeId?: string; prompt?: string; nonInteractive?: boolean },
    ) => {
      const ws = workspaces.find((w) => w.id === workspaceId)
      const session = await spawnWorkspaceAgent(workspaceId, {
        runtimeId: opts?.runtimeId ?? ws?.runtimeId ?? settings.defaultRuntime,
        homeProjectId,
        prompt: opts?.prompt,
        nonInteractive: opts?.nonInteractive,
      })
      setActiveWorkspaceId(workspaceId); overlays.handleSelectSession(session.id, session.projectId)
    },
    onLaunchWorkspaceAgent: async (
      workspaceId: string,
      homeProjectId: string,
      options: { runtimeId: string; prompt: string; nonInteractive?: boolean },
    ) => {
      const ws = workspaces.find((w) => w.id === workspaceId)
      const session = await spawnWorkspaceAgent(workspaceId, {
        runtimeId: options.runtimeId ?? ws?.runtimeId ?? settings.defaultRuntime,
        homeProjectId,
        prompt: options.prompt,
        nonInteractive: options.nonInteractive,
      })
      setActiveWorkspaceId(workspaceId); overlays.handleSelectSession(session.id, session.projectId)
      return session
    },
```

- [ ] **Step 2: Type the dock-state fields**

In `src/renderer/components/editor/dock-panel-types.ts`, update the `onSpawnWorkspaceAgent` line (94) and add `onLaunchWorkspaceAgent`:

```ts
  onSpawnWorkspaceAgent?: (workspaceId: string, homeProjectId?: string, opts?: { runtimeId?: string; prompt?: string; nonInteractive?: boolean }) => void
  onLaunchWorkspaceAgent?: (workspaceId: string, homeProjectId: string, options: { runtimeId: string; prompt: string; nonInteractive?: boolean }) => Promise<unknown>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: no new errors. (`spawnWorkspaceAgent` already accepts `prompt`/`nonInteractive` after Task 1's type change.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/editor/dock-panel-types.ts
git commit -m "feat(workspace): launch handler that maps the New-Agent form into a workspace spawn"
```

---

## Task 3: Trimmed "workspace mode" for `NewAgentForm`

**Files:**
- Modify: `src/renderer/components/modals/NewAgentForm.tsx` (props ~line 13-37; render ~line 179-243)
- Test: `src/renderer/components/modals/NewAgentForm.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/renderer/components/modals/NewAgentForm.test.tsx`, add (reuse the file's existing render helper / props; pass `compact`):

```tsx
  it('in compact mode shows the AI picker and hides Advanced + resume', () => {
    renderForm({ compact: true })
    // AI/runtime dropdown is shown directly
    expect(screen.getByLabelText('Agent runtime')).toBeInTheDocument()
    // No Advanced toggle, no "Continue on an existing branch or PR"
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument()
    expect(screen.queryByText('Continue on an existing branch or PR')).not.toBeInTheDocument()
  })
```

If `AgentDropdown` doesn't expose `aria-label="Agent runtime"`, add that aria-label to `AgentDropdown`'s `<select>`/trigger as part of Step 3 so the control is queryable; otherwise assert on the runtime name text it renders.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/components/modals/NewAgentForm.test.tsx -t "compact"`
Expected: FAIL — `compact` not a prop; Advanced toggle still present.

- [ ] **Step 3: Add the `compact` prop and branch the render**

In `src/renderer/components/modals/NewAgentForm.tsx`:

(a) Import the dropdown at the top:

```tsx
import { NewAgentModePill } from './NewAgentModePill'
import { AgentDropdown } from './AgentDropdown'
```

(b) Add `compact` to the destructured props and the prop type:

```tsx
  onDeleteSession,
  focusTrigger,
  compact = false,
}: {
```
…and in the type object add:
```tsx
  focusTrigger?: number
  compact?: boolean
```

(c) Replace the `return (...)` body so that, in compact mode, it renders only the name input, the promoted AI picker, error, and the mode pill (which includes Start):

```tsx
  if (compact) {
    return (
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)', width: 420, maxWidth: '90%' }}>
        <TaskDescriptionField
          value={taskDescription}
          onChange={setTaskDescription}
          inputRef={inputRef}
          canSubmit={canSubmit}
          loading={loading}
        />
        <AgentDropdown value={runtimeId} onChange={setRuntimeId} runtimes={runtimes} />
        {error && <p style={modalStyles.errorText}>{error}</p>}
        <NewAgentModePill mode={mode} setMode={setMode} canSubmit={canSubmit} loading={loading} />
      </form>
    )
  }

  return (
```
(leave the existing full `return (...)` exactly as-is below this block.)

In compact mode `useExisting` is never set, so `handleSubmit` already produces `{ projectId, runtimeId, prompt, nonInteractive }` (the base options) — the parent's `onLaunch` routes that into the workspace spawn (Task 4). No submit-logic change needed.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/renderer/components/modals/NewAgentForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/NewAgentForm.tsx src/renderer/components/modals/NewAgentForm.test.tsx
git commit -m "feat(new-agent): compact workspace mode (name + AI + mode only)"
```

---

## Task 4: Render the compact form for a workspace repo, wired to the workspace launch

**Files:**
- Modify: `src/renderer/components/modals/OnboardingView.tsx` (`NoAgentProps` + the `no-agent` render)
- Modify: `src/renderer/components/editor/dock-agent-panel.tsx` (the `no-agent` branch ~line 130-148)

- [ ] **Step 1: Add `compact` to OnboardingView's no-agent variant**

In `src/renderer/components/modals/OnboardingView.tsx`, add to `NoAgentProps`:

```tsx
  focusTrigger?: number
  compact?: boolean
```

…and pass it to `NewAgentForm` in the `no-agent` branch:

```tsx
              onResumeSession={props.onResumeSession}
              onDeleteSession={props.onDeleteSession}
              focusTrigger={props.focusTrigger}
              compact={props.compact}
```

- [ ] **Step 2: In the agent panel, detect workspace context and wire the launch**

In `src/renderer/components/editor/dock-agent-panel.tsx`, just before the `no-agent` `return` (line 130), compute the active workspace for the selected repo:

```tsx
  const workspaceForRepo = s.activeWorkspaceId
    ? s.workspaces?.find((w) => w.id === s.activeWorkspaceId && !!s.activeProjectId && w.projectIds.includes(s.activeProjectId))
    : undefined
```

Then change the `no-agent` block to route `onLaunch` to the workspace spawn when in a workspace, and pass `compact`:

```tsx
  if (!targetSessionId && s.activeProjectId && activeProject) {
    const projectId = s.activeProjectId
    const onLaunch = workspaceForRepo && s.onLaunchWorkspaceAgent
      ? (opts: SpawnAgentOptions) => s.onLaunchWorkspaceAgent!(workspaceForRepo.id, projectId, {
          runtimeId: opts.runtimeId,
          prompt: opts.prompt,
          nonInteractive: opts.nonInteractive,
        })
      : s.onLaunchAgent
    return (
      <OnboardingView
        variant="no-agent"
        projectId={projectId}
        projectName={activeProject.name}
        projectPath={activeProject.path}
        baseBranch={s.baseBranch}
        isGitProject={s.activeProjectIsGit}
        defaultRuntime={s.defaultRuntime}
        defaultAgentMode={s.defaultAgentMode}
        onLaunch={onLaunch}
        existingSessions={projectSessions}
        onResumeSession={s.onResumeAgent}
        onDeleteSession={(session) => s.onRequestDeleteAgent(session, activeProject.path)}
        focusTrigger={s.newAgentFocusTrigger}
        compact={!!workspaceForRepo}
      />
    )
  }
```

Add the `SpawnAgentOptions` import if not present:
```tsx
import type { SpawnAgentOptions } from '../../../shared/types'
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:web`
Expected: no new errors. (`s.workspaces`, `s.activeWorkspaceId`, `s.onLaunchWorkspaceAgent` are all on the dock state per Task 2 + existing fields.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/modals/OnboardingView.tsx src/renderer/components/editor/dock-agent-panel.tsx
git commit -m "feat(workspace): render the compact New-Agent form for a selected workspace repo"
```

---

## Task 5: Make workspace repos selectable; remove the ▶

**Files:**
- Modify: `src/renderer/App.tsx` (add `onSelectWorkspaceRepo`; make `onNewAgentFromHeader` workspace-aware)
- Modify: `src/renderer/components/editor/dock-panel-types.ts` (add `onSelectWorkspaceRepo`)
- Modify: `src/renderer/components/sidebar/ProjectSidebar.tsx` (thread `onSelectWorkspaceRepo` + `activeProjectId` into `WorkspaceList`; simplify footer button)
- Modify: `src/renderer/components/sidebar/WorkspaceList.tsx` (remove ▶; clickable+highlighted repo rows)
- Test: `src/renderer/components/sidebar/ProjectSidebar.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/renderer/components/sidebar/ProjectSidebar.test.tsx`:

```tsx
  it('selecting a workspace repo calls onSelectWorkspaceRepo and no longer shows a play button', () => {
    const onSelectWorkspaceRepo = vi.fn()
    renderSidebar({
      workspaces: [{ id: 'ws1', name: 'auth-refactor', projectIds: ['p1', 'p2'], createdAt: '2024-01-01' }],
      activeWorkspaceId: 'ws1',
      onSelectWorkspace: vi.fn(),
      onRemoveWorkspace: vi.fn(),
      onSpawnWorkspaceAgent: vi.fn(),
      onSelectWorkspaceRepo,
    })

    // No "Start agent here" play buttons inside the workspace anymore
    expect(screen.queryByLabelText('Start agent in Alpha')).not.toBeInTheDocument()
    // Clicking the repo row selects it
    fireEvent.click(screen.getByText('Alpha'))
    expect(onSelectWorkspaceRepo).toHaveBeenCalledWith('ws1', 'p1')
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/renderer/components/sidebar/ProjectSidebar.test.tsx -t "selecting a workspace repo"`
Expected: FAIL — the play button still exists / `onSelectWorkspaceRepo` not wired.

- [ ] **Step 3: Add `onSelectWorkspaceRepo` + workspace-aware New Agent in App**

In `src/renderer/App.tsx`, add to the dock-state object (near the other workspace handlers, ~line 212):

```ts
    onSelectWorkspaceRepo: (workspaceId: string, projectId: string) => {
      setActiveWorkspaceId(workspaceId); setActiveProject(projectId); setActiveSession(null)
    },
```

And make the footer "+ New Agent" keep the workspace context instead of nulling it (replace line 207):

```ts
    onNewAgentFromHeader: () => {
      if (activeWorkspaceId) {
        const ws = workspaces.find((w) => w.id === activeWorkspaceId)
        const home = activeProjectId && ws?.projectIds.includes(activeProjectId) ? activeProjectId : ws?.projectIds[0]
        if (home) setActiveProject(home)
        overlays.handleNewAgentFromHeader()
      } else {
        setActiveWorkspaceId(null); overlays.handleNewAgentFromHeader()
      }
    },
```

- [ ] **Step 4: Type the dock-state field**

In `src/renderer/components/editor/dock-panel-types.ts`, add near `onSpawnWorkspaceAgent`:

```ts
  onSelectWorkspaceRepo?: (workspaceId: string, projectId: string) => void
```

- [ ] **Step 5: Thread props through ProjectSidebar and simplify the footer button**

In `src/renderer/components/sidebar/ProjectSidebar.tsx`:

(a) Add to `ProjectSidebarProps` (near `onSpawnWorkspaceAgent`):
```tsx
  onSelectWorkspaceRepo?: (workspaceId: string, projectId: string) => void
```
…and destructure `onSelectWorkspaceRepo`.

(b) Pass to `<WorkspaceList>` (after `onNewWorkspace={onNewWorkspace}`):
```tsx
          onSelectRepo={onSelectWorkspaceRepo}
          activeProjectId={activeProjectId}
```

(c) The footer "+ New Agent" should no longer quick-spawn — it just calls `onNewAgent` (now workspace-aware in App). Replace the primary button's `onClick` with:
```tsx
          onClick={onNewAgent}
```
…and keep the context-aware label (`+ New Agent in {name}` when `activeWorkspace`).

- [ ] **Step 6: Update WorkspaceList — remove ▶, selectable+highlighted rows**

In `src/renderer/components/sidebar/WorkspaceList.tsx`:

(a) Add to `WorkspaceListProps` + destructure:
```tsx
  onSelectRepo?: (workspaceId: string, projectId: string) => void
  activeProjectId?: string | null
```

(b) Delete the ▶ button block (the `<button … aria-label={`Start agent in ${repoName}`} …>&#9654;</button>`).

(c) Make the repo row clickable + highlighted. Replace the repo row's opening `<div className="sidebar-item-row sidebar-repo-row" …>` with:
```tsx
                <div
                  className={`sidebar-item-row sidebar-repo-row${activeProjectId === pid ? ' sidebar-item-row--active' : ''}`}
                  style={{ ...sidebarStyles.item, paddingLeft: 16 }}
                  title={repo?.path ?? pid}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectRepo?.(w.id, pid)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectRepo?.(w.id, pid) } }}
                >
```
(The ↻ fetch and × remove buttons remain inside `sidebar-item-actions` and already call `e.stopPropagation()`.)

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/renderer/components/sidebar/ProjectSidebar.test.tsx`
Expected: PASS — the new selection test plus all existing tests. (The earlier "fetches a workspace repo from its refresh button" test still passes — the ↻ button is unchanged.)

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck:web`
Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/App.tsx src/renderer/components/editor/dock-panel-types.ts src/renderer/components/sidebar/ProjectSidebar.tsx src/renderer/components/sidebar/WorkspaceList.tsx src/renderer/components/sidebar/ProjectSidebar.test.tsx
git commit -m "feat(workspace): select a repo to create its agent via the form; remove the play button"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the affected test files**

Run:
```bash
npx vitest run src/renderer/components/sidebar/ProjectSidebar.test.tsx src/renderer/components/modals/NewAgentForm.test.tsx src/main/workspace/workspace-manager.test.ts
```
Expected: all PASS.

- [ ] **Step 2: Typecheck both projects**

Run: `npm run typecheck:web && npm run typecheck:node`
Expected: no new errors vs baselines.

- [ ] **Step 3 (manual, during review): smoke test in the app**

Launch the app (project `run` skill). Confirm:
1. Workspace repo rows show ↻ and × but no ▶.
2. Clicking a workspace repo selects it (highlighted in the card); the panel shows "New agent for {repo}" with name + AI picker + Interactive/Chat and no Advanced.
3. "+ New Agent" with a workspace repo selected opens that same form; with a workspace active but no repo selected, it targets the primary repo.
4. Start Agent spawns a workspace agent homed in the selected repo (it can read/edit the workspace's other repos), with the chosen runtime/mode, and selects it.

---

## Self-review notes

- **Spec coverage:** remove ▶ → Task 5; select repo + "+ New Agent" → trimmed form → Tasks 4-5; form has name+AI+mode, no Advanced → Task 3; multi-root workspace agent with chosen runtime/mode → Tasks 1-2-4; default-to-primary when no repo selected → Task 5 (`onNewAgentFromHeader`). 
- **Type consistency:** `onLaunchWorkspaceAgent(workspaceId, homeProjectId, { runtimeId, prompt, nonInteractive })` is defined identically in App.tsx (Task 2), dock-panel-types (Task 2), and consumed in dock-agent-panel (Task 4). `onSelectWorkspaceRepo(workspaceId, projectId)` is identical in App (Task 5), dock-panel-types (Task 5), ProjectSidebar (`onSelectWorkspaceRepo`) → WorkspaceList (`onSelectRepo`). `WorkspaceSpawnAgentOptions.nonInteractive` (Task 1) matches the `opts.nonInteractive` passed in Task 2.
- **Risk note:** the `AgentDropdown` aria-label (`Agent runtime`) may need adding for the Task 3 test query — Step 1 calls this out. If `createSession`'s input type in `workspace-manager` doesn't already include `nonInteractive`, Task 1 Step 6 widens it.
