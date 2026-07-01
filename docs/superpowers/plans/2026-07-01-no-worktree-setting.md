# Optional Worktrees With a Global Setting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users run new agents directly in the repository (a new branch checked out in place) instead of in an isolated worktree, controlled by a global setting plus a per-agent override.

**Architecture:** A new `useWorktrees` boolean setting (default `true`) flips the default for new agents. The value threads through the existing settings prop chain into the New Agent form, which sets the already-implemented `SpawnAgentOptions.noWorktree` flag. `SessionCreator` already handles the in-place new-branch spawn — no main-process changes needed. A non-blocking warning appears when starting an in-place agent while another in-place agent runs in the same repo.

**Tech Stack:** TypeScript, React (renderer), Electron IPC, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-30-no-worktree-setting-design.md`

## Global Constraints

- Max 300 LOC per file; split touched files that approach/exceed it (project rule).
- Match existing style; surgical changes only — every changed line traces to this feature.
- TDD: write the failing test first, watch it fail, implement minimally, watch it pass.
- Setting default is `true` — must preserve today's behavior (worktree-per-agent) for existing configs.
- Positive framing: setting is `useWorktrees` (not `defaultNoWorktree`). Per-agent override reuses the existing `SpawnAgentOptions.noWorktree`.
- Test runner: `npx vitest run <file>` (per the `testing` skill; if a native `better-sqlite3` ABI error appears, run `npm run rebuild` first — not expected for these renderer/store tests).
- Typecheck gates: `npm run typecheck:web` must stay green (0 errors); it is the real gate for renderer code.
- Docs (CLAUDE.md §5): code change ⇒ update covering architecture page(s) in the same PR.

---

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `src/shared/types.ts` | `ManifoldSettings.useWorktrees` field | modify |
| `src/shared/defaults.ts` | default `useWorktrees: true` | modify |
| `src/main/store/settings-store.test.ts` | assert default present | modify (test) |
| `src/renderer/components/modals/settings/GeneralSettingsSection.tsx` | global toggle checkbox | modify |
| `src/renderer/components/modals/settings/SettingsModalBody.tsx` | pass setting through | modify |
| `src/renderer/components/modals/SettingsModal.tsx` | local state + save | modify |
| `src/renderer/components/editor/editor-shell/dock-panel-types.ts` | `defaultUseWorktrees` in panel state | modify |
| `src/renderer/App.tsx` | read `settings.useWorktrees` into panel props | modify |
| `src/renderer/components/editor/editor-shell/dock-agent-panel.tsx` | pass prop to OnboardingView | modify |
| `src/renderer/components/modals/OnboardingView.tsx` | pass prop to NewAgentForm | modify |
| `src/renderer/components/modals/NewAgentForm.tsx` | per-agent state, submit logic, warning | modify |
| `src/renderer/components/modals/NewAgentForm.test.tsx` | new behaviors | modify (test) |
| `src/renderer/components/modals/NewAgentAdvanced.tsx` | per-agent checkbox | modify |
| `src/main/session/session-creator.test.ts` | in-place new-branch path coverage | modify (test) |
| `docs/architecture/store.md`, `renderer.md`, `session.md` | doc sync | modify (docs) |

---

## Task 1: Add the `useWorktrees` setting

**Files:**
- Modify: `src/shared/types.ts` (in `ManifoldSettings`, near `sidebarResizeReversed`)
- Modify: `src/shared/defaults.ts` (in `DEFAULT_SETTINGS`)
- Test: `src/main/store/settings-store.test.ts`

**Interfaces:**
- Produces: `ManifoldSettings.useWorktrees: boolean` (default `true`). Consumed by SettingsModal (Task 2) and App.tsx (Task 3).

- [ ] **Step 1: Write the failing test**

Add to `src/main/store/settings-store.test.ts` inside `describe('constructor / loadFromDisk')`:

```ts
it('defaults useWorktrees to true', () => {
  mockExistsSync.mockReturnValue(false)
  const store = new SettingsStore()
  expect(store.getSettings().useWorktrees).toBe(true)
})

it('preserves useWorktrees:false from disk', () => {
  mockExistsSync.mockReturnValue(true)
  mockReadFileSync.mockReturnValue(JSON.stringify({ useWorktrees: false }))
  const store = new SettingsStore()
  expect(store.getSettings().useWorktrees).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/store/settings-store.test.ts`
Expected: FAIL — `useWorktrees` is `undefined` (and existing `toEqual(RESOLVED_DEFAULTS)` may fail once the default lands, which Step 3 fixes).

- [ ] **Step 3: Implement**

In `src/shared/types.ts`, add to the `ManifoldSettings` interface after `sidebarResizeReversed: boolean`:

```ts
  /** Create an isolated git worktree for each new agent. When false, new agents
   *  run directly in the repository on a new branch. Default true. */
  useWorktrees: boolean
```

In `src/shared/defaults.ts`, add to `DEFAULT_SETTINGS` after `sidebarResizeReversed: false,`:

```ts
  useWorktrees: true,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/store/settings-store.test.ts`
Expected: PASS (new cases pass; `RESOLVED_DEFAULTS` equality still holds because it spreads `DEFAULT_SETTINGS`).

Run: `npm run typecheck:web && npm run typecheck:node`
Expected: no new errors (node baseline unchanged; web = 0).

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/defaults.ts src/main/store/settings-store.test.ts
git commit -m "feat(settings): add useWorktrees setting (default true)"
```

---

## Task 2: Global settings toggle UI

**Files:**
- Modify: `src/renderer/components/modals/settings/GeneralSettingsSection.tsx`
- Modify: `src/renderer/components/modals/settings/SettingsModalBody.tsx`
- Modify: `src/renderer/components/modals/SettingsModal.tsx`

**Interfaces:**
- Consumes: `ManifoldSettings.useWorktrees` (Task 1).
- Produces: a checkbox that calls `onSave({ useWorktrees })` via the existing Save flow. Mirrors the `autoGenerateMessages` wiring exactly.

- [ ] **Step 1: Add props + checkbox to `GeneralSettingsSection.tsx`**

In the `Props` interface, after `sidebarResizeReversed` / `onSidebarResizeReversedChange`:

```ts
  useWorktrees: boolean
  onUseWorktreesChange: (enabled: boolean) => void
```

In the "Workspace" `SectionCard`, after the `showCommitAndPrButtons` label block, add:

```tsx
            <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull }}>
              <input type="checkbox" checked={props.useWorktrees} onChange={(event) => props.onUseWorktreesChange(event.target.checked)} style={modalStyles.checkboxInput} />
              Create an isolated git worktree for each new agent
              <span style={modalStyles.helpText}>When off, new agents run directly in the repository on a new branch. Only one in-place agent can safely run per repo at a time.</span>
            </label>
```

- [ ] **Step 2: Thread through `SettingsModalBody.tsx`**

In the `Props` interface, after `onSidebarResizeReversedChange`:

```ts
  useWorktrees: boolean
  onUseWorktreesChange: (enabled: boolean) => void
```

No change to the render body is needed — `GeneralSettingsSection` receives `{...props}`.

- [ ] **Step 3: Add local state + save in `SettingsModal.tsx`**

Add state after `sidebarResizeReversed`:

```ts
  const [useWorktrees, setUseWorktrees] = useState(settings.useWorktrees)
```

Add to the visibility-reset effect after `setSidebarResizeReversed(...)`:

```ts
    setUseWorktrees(settings.useWorktrees)
```

Add to the `handleSave` payload object (and its dependency array) after `sidebarResizeReversed,`:

```ts
      useWorktrees,
```

Add to the `<SettingsModalBody .../>` props after `onSidebarResizeReversedChange`:

```tsx
          useWorktrees={useWorktrees}
          onUseWorktreesChange={setUseWorktrees}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:web`
Expected: 0 errors. (No unit test for this pure-wiring UI — matches existing `autoGenerateMessages`, which has none; verified visually in Task 8.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/settings/GeneralSettingsSection.tsx src/renderer/components/modals/settings/SettingsModalBody.tsx src/renderer/components/modals/SettingsModal.tsx
git commit -m "feat(settings): add worktree toggle to General settings"
```

---

## Task 3: Thread the default into the New Agent form + default-off submit logic

**Files:**
- Modify: `src/renderer/components/editor/editor-shell/dock-panel-types.ts`
- Modify: `src/renderer/App.tsx:293`
- Modify: `src/renderer/components/editor/editor-shell/dock-agent-panel.tsx`
- Modify: `src/renderer/components/modals/OnboardingView.tsx`
- Modify: `src/renderer/components/modals/NewAgentForm.tsx`
- Test: `src/renderer/components/modals/NewAgentForm.test.tsx`

**Interfaces:**
- Consumes: `settings.useWorktrees` (Task 1).
- Produces: `NewAgentForm` prop `defaultUseWorktrees?: boolean` (default `true` when omitted) and internal `worktreeEnabled` state that Task 4 (checkbox) and Task 5 (warning) both read. Submit sets `noWorktree: true` on the new-branch path when `worktreeEnabled` is false.

- [ ] **Step 1: Write the failing test**

Add to `src/renderer/components/modals/NewAgentForm.test.tsx` inside `describe('NewAgentForm')`:

```ts
it('creates an agent in place when defaultUseWorktrees is false (empty picker)', async () => {
  const { props } = renderForm({ defaultUseWorktrees: false })
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

  fireEvent.click(screen.getByText('Start Agent'))

  await waitFor(() => expect(props.onLaunch).toHaveBeenCalled())
  const options = props.onLaunch.mock.calls[0][0]
  expect(options.noWorktree).toBe(true)
  expect(options.existingBranch).toBeUndefined()
  expect(options.stayOnBranch).toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/components/modals/NewAgentForm.test.tsx -t "in place when defaultUseWorktrees is false"`
Expected: FAIL — `options.noWorktree` is `undefined` (prop not yet honored).

- [ ] **Step 3: Add the panel-state field**

In `src/renderer/components/editor/editor-shell/dock-panel-types.ts`, after `defaultAgentMode: 'interactive' | 'chat'`:

```ts
  defaultUseWorktrees: boolean
```

- [ ] **Step 4: Populate it in `App.tsx`**

In `src/renderer/App.tsx:293`, in the same object literal that sets `defaultAgentMode`, add:

```ts
    defaultUseWorktrees: settings.useWorktrees ?? true,
```

- [ ] **Step 5: Pass it in `dock-agent-panel.tsx`**

In the `<OnboardingView .../>` for the `no-agent` variant, after `defaultAgentMode={s.defaultAgentMode}`:

```tsx
        defaultUseWorktrees={s.defaultUseWorktrees}
```

- [ ] **Step 6: Pass it in `OnboardingView.tsx`**

In the `NoAgentProps` interface, after `defaultAgentMode: 'interactive' | 'chat'`:

```ts
  defaultUseWorktrees?: boolean
```

In the `<NewAgentForm .../>` render, after `defaultAgentMode={props.defaultAgentMode}`:

```tsx
              defaultUseWorktrees={props.defaultUseWorktrees}
```

- [ ] **Step 7: Honor it in `NewAgentForm.tsx`**

Add to the destructured props (with default) after `defaultAgentMode = 'interactive',`:

```tsx
  defaultUseWorktrees = true,
```

Add to the prop type block after `defaultAgentMode?: AgentMode`:

```tsx
  defaultUseWorktrees?: boolean
```

Add state after `const [mode, setMode] = useState<AgentMode>(defaultAgentMode)`:

```tsx
  const [worktreeEnabled, setWorktreeEnabled] = useState(defaultUseWorktrees)
```

In `handleSubmit`, change the new-branch return (currently `return base`) to:

```tsx
        return worktreeEnabled ? base : { ...base, noWorktree: true }
```

Add `worktreeEnabled` to the `handleSubmit` `useCallback` dependency array.

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/renderer/components/modals/NewAgentForm.test.tsx`
Expected: PASS — new case passes; existing "does not create a worktree by default (empty picker)" still passes (default `worktreeEnabled = true` ⇒ `noWorktree` undefined).

Run: `npm run typecheck:web`
Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/editor/editor-shell/dock-panel-types.ts src/renderer/App.tsx src/renderer/components/editor/editor-shell/dock-agent-panel.tsx src/renderer/components/modals/OnboardingView.tsx src/renderer/components/modals/NewAgentForm.tsx src/renderer/components/modals/NewAgentForm.test.tsx
git commit -m "feat(agent): honor useWorktrees default when creating agents"
```

---

## Task 4: Per-agent worktree checkbox in Advanced

**Files:**
- Modify: `src/renderer/components/modals/NewAgentAdvanced.tsx`
- Modify: `src/renderer/components/modals/NewAgentForm.tsx`
- Test: `src/renderer/components/modals/NewAgentForm.test.tsx`

**Interfaces:**
- Consumes: `worktreeEnabled` / `setWorktreeEnabled` (Task 3).
- Produces: a checkbox labelled "Use an isolated worktree", rendered only when `!useExisting`.

- [ ] **Step 1: Write the failing test**

Add to `src/renderer/components/modals/NewAgentForm.test.tsx`:

```ts
it('sends noWorktree when the worktree checkbox is unchecked', async () => {
  const { props } = renderForm()
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

  fireEvent.click(screen.getByText(/Advanced/))
  fireEvent.click(screen.getByLabelText('Use an isolated worktree'))
  fireEvent.click(screen.getByText('Start Agent'))

  await waitFor(() => {
    expect(props.onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({ noWorktree: true }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/components/modals/NewAgentForm.test.tsx -t "worktree checkbox is unchecked"`
Expected: FAIL — `getByLabelText('Use an isolated worktree')` throws (checkbox not rendered).

- [ ] **Step 3: Add props to `NewAgentAdvanced.tsx`**

In the `Props` interface, after `isGitProject: boolean`:

```ts
  worktreeEnabled: boolean
  setWorktreeEnabled: (v: boolean) => void
```

Inside the `{p.isGitProject && (` block, immediately before the existing `"Continue on an existing branch or PR"` label, add:

```tsx
          {!p.useExisting && (
            <label style={modalStyles.checkboxLabel}>
              <input type="checkbox" checked={p.worktreeEnabled} onChange={(e) => p.setWorktreeEnabled(e.target.checked)} />
              Use an isolated worktree
            </label>
          )}
```

- [ ] **Step 4: Wire in `NewAgentForm.tsx`**

In the `<NewAgentAdvanced .../>` render, after `isGitProject={isGitProject}`:

```tsx
          worktreeEnabled={worktreeEnabled}
          setWorktreeEnabled={setWorktreeEnabled}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/renderer/components/modals/NewAgentForm.test.tsx`
Expected: PASS (all cases).

Run: `npm run typecheck:web`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/modals/NewAgentAdvanced.tsx src/renderer/components/modals/NewAgentForm.tsx src/renderer/components/modals/NewAgentForm.test.tsx
git commit -m "feat(agent): add per-agent isolated-worktree toggle"
```

---

## Task 5: Non-blocking concurrency warning

**Files:**
- Modify: `src/renderer/components/modals/NewAgentForm.tsx`
- Test: `src/renderer/components/modals/NewAgentForm.test.tsx`

**Interfaces:**
- Consumes: `existingSessions` prop (already present), `worktreeEnabled`, `useExisting`.
- Produces: an inline warning element (never disables submit).

- [ ] **Step 1: Write the failing test**

Add to `src/renderer/components/modals/NewAgentForm.test.tsx`:

```ts
it('warns when an in-place agent is already running and this one will run in place', async () => {
  renderForm({
    defaultUseWorktrees: false,
    existingSessions: [
      { id: 's1', projectId: 'proj-1', runtimeId: 'claude', branchName: 'x', worktreePath: '/repos/proj-1', status: 'running', pid: 1, additionalDirs: [], noWorktree: true },
    ],
  })
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

  expect(screen.getByText(/share one working tree/i)).toBeTruthy()
})

it('does not warn when the existing in-place agent is finished', async () => {
  renderForm({
    defaultUseWorktrees: false,
    existingSessions: [
      { id: 's1', projectId: 'proj-1', runtimeId: 'claude', branchName: 'x', worktreePath: '/repos/proj-1', status: 'done', pid: null, additionalDirs: [], noWorktree: true },
    ],
  })
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

  expect(screen.queryByText(/share one working tree/i)).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/components/modals/NewAgentForm.test.tsx -t "in-place agent is already running"`
Expected: FAIL — warning text not found.

- [ ] **Step 3: Implement**

In `NewAgentForm.tsx`, after the `reusableSessions` computation, add:

```tsx
  const inPlaceAgentRunning = existingSessions.some(
    (session) => session.noWorktree && (session.status === 'running' || session.status === 'waiting')
  )
  const willRunInPlace = !worktreeEnabled || useExisting
```

In the non-compact `return`, immediately after the `{error && ...}` line (the one before `<NewAgentModePill .../>`), add:

```tsx
      {willRunInPlace && inPlaceAgentRunning && (
        <p style={modalStyles.infoText}>
          ⚠ Another agent is already running directly in this repository. They share one working tree — running both at once can cause conflicts.
        </p>
      )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/components/modals/NewAgentForm.test.tsx`
Expected: PASS (all cases).

Run: `npm run typecheck:web`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/NewAgentForm.tsx src/renderer/components/modals/NewAgentForm.test.tsx
git commit -m "feat(agent): warn when starting a second in-place agent in a repo"
```

---

## Task 6: Cover the in-place new-branch spawn path

**Files:**
- Test: `src/main/session/session-creator.test.ts`

**Interfaces:**
- Consumes: existing `SessionCreator.create` behavior (`session-creator.ts:67-74`).
- Produces: regression coverage that `noWorktree: true` with no `stayOnBranch`/`existingBranch`/`prIdentifier` checks a clean tree and runs `git checkout -b` in the project path (not a worktree), and writes no worktree meta.

- [ ] **Step 1: Read the existing test harness**

Read `src/main/session/session-creator.test.ts` top-of-file mocks and a `createInteractiveClaude`-style helper to reuse the existing `gitExec`/`ptyPool`/`projectRegistry` mocks. Note: `gitExec` is mocked per-call with `mockResolvedValueOnce`.

- [ ] **Step 2: Write the test**

Add (adapting to the file's existing helpers/mock names):

```ts
it('creates a new branch in place when noWorktree is set without stayOnBranch', async () => {
  // status --porcelain (clean) then checkout -b
  vi.mocked(gitExec).mockResolvedValueOnce('')      // assertCleanWorkingTree: clean
  vi.mocked(gitExec).mockResolvedValueOnce('')      // checkout -b
  const { creator } = createInteractiveClaude()

  const session = await creator.create({
    projectId: 'proj-1',
    runtimeId: 'claude',
    prompt: 'hi',
    branchName: 'feature-inplace',
    noWorktree: true,
  })

  expect(vi.mocked(gitExec)).toHaveBeenCalledWith(['status', '--porcelain'], '/repos/proj-1')
  expect(vi.mocked(gitExec)).toHaveBeenCalledWith(['checkout', '-b', 'feature-inplace'], '/repos/proj-1')
  expect(session.noWorktree).toBe(true)
  expect(session.worktreePath).toBe('/repos/proj-1')
  expect(session.branchName).toBe('feature-inplace')
})
```

Note: confirm the project path the test harness registers (`resolveProject`) — use whatever path the harness's `projectRegistry` mock returns for `proj-1` instead of `/repos/proj-1` if different.

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/main/session/session-creator.test.ts -t "new branch in place"`
Expected: PASS (behavior already exists). If it fails, the fix belongs in the test (wrong mock path/order), not in `session-creator.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/main/session/session-creator.test.ts
git commit -m "test(session): cover noWorktree new-branch-in-place spawn"
```

---

## Task 7: Documentation sync

**Files:**
- Modify: `docs/architecture/store.md`
- Modify: `docs/architecture/renderer.md`
- Modify: `docs/architecture/session.md` (only if it claims agents *always* get a worktree)

**Interfaces:** none (docs).

- [ ] **Step 1: Update `store.md`**

Document the `useWorktrees` setting (default `true`, meaning: new agents get an isolated worktree; when `false`, they run in place on a new branch). Cite `src/shared/types.ts` and `src/shared/defaults.ts` with current line numbers. Bump the `updated:` frontmatter date to `2026-07-01`.

- [ ] **Step 2: Update `renderer.md`**

Note the New Agent form's per-agent "Use an isolated worktree" toggle (defaulting to the `useWorktrees` setting) and the in-place concurrency warning. Cite `NewAgentForm.tsx` / `NewAgentAdvanced.tsx`. Bump `updated:`.

- [ ] **Step 3: Update `session.md` if needed**

Grep the page for "worktree". If it states every session gets a worktree, correct it to "a worktree by default, or in place on a new branch when `noWorktree` is set", citing `session-creator.ts:40` and `:67-74`. Bump `updated:` only if changed.

- [ ] **Step 4: Verify docs against code + lint**

Run: `bash scripts/wiki-lint.sh`
Expected: no stale-page complaints for the pages touched. Confirm each cited `file:line` is accurate.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/store.md docs/architecture/renderer.md docs/architecture/session.md
git commit -m "docs: document useWorktrees setting and in-place agents"
```

---

## Task 8: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full renderer + store + session test sweep**

Run:
```bash
npx vitest run src/renderer/components/modals/NewAgentForm.test.tsx src/main/store/settings-store.test.ts src/main/session/session-creator.test.ts
```
Expected: all PASS.

- [ ] **Step 2: Typecheck gate**

Run: `npm run typecheck:web`
Expected: 0 errors. (Renderer/shared changes must not add any.)

- [ ] **Step 3: Manual smoke (per the `verify` skill / built Electron)**

- Settings → General → "Workspace": toggle "Create an isolated git worktree for each new agent" off; Save.
- New Agent in a git repo with a clean tree → confirm it starts on a new branch in the main repo (no new `~/.manifold/worktrees/<repo>/…` dir), and the sidebar/session shows in-place (no worktree affordances).
- Toggle back on → New Agent creates a worktree as before.
- With an in-place agent running, open New Agent (worktree off) → the concurrency warning appears; Start is still enabled.

- [ ] **Step 4: Report results with evidence** (paste command output; do not claim success from inspection alone).

---

## Self-Review

**Spec coverage:**
- Global setting `useWorktrees` (default true) → Task 1. ✓
- Settings UI toggle → Task 2. ✓
- Per-agent override (Advanced checkbox, hidden when existing-branch/PR) → Tasks 3 (state/logic) + 4 (UI). ✓
- New-branch-in-place when off → Task 3 submit logic + Task 6 backend coverage. ✓
- Warn-only concurrency → Task 5. ✓
- Non-goals (no per-project pref, no blocking, no change to existing-branch/PR/folder flows) → respected; folder/existing flows untouched. ✓
- Tests + docs → Tasks 1–8. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. One conditional instruction (Task 6 project path; Task 7 Step 3 session.md) is guarded with an explicit check, not a placeholder.

**Type consistency:** `useWorktrees: boolean` (types/defaults/settings-store/SettingsModal/body/GeneralSettingsSection), `defaultUseWorktrees` (dock-panel-types/App/dock-agent-panel/OnboardingView/NewAgentForm), `worktreeEnabled`/`setWorktreeEnabled` (NewAgentForm ↔ NewAgentAdvanced) used identically across tasks. `SpawnAgentOptions.noWorktree` reused unchanged. `AgentStatus` active states `'running' | 'waiting'` match `src/shared/types.ts:13`.
