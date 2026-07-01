# Optional worktrees with a global setting

**Date:** 2026-06-30
**Status:** Approved (design); pending implementation plan
**Branch:** `manifold/no-worktrees`

## Problem

Today every new agent in a git repository gets its own *worktree* — an isolated checked-out
working tree on a fresh branch under `~/.manifold/worktrees/`. This is what lets multiple agents
run against the same repo in parallel. Some users want the opposite: run the agent **directly in
the repository** (a new branch checked out in place), with no separate worktree directory.

The per-spawn primitive for this already exists (`SpawnAgentOptions.noWorktree`), but there is no
user-facing way to choose it for normal new-agent creation, and no setting to make it the default.

## Goals

1. A **global setting** that flips the default for new agents between "create a worktree" and "work
   directly in the repo."
2. A **per-agent override** in the New Agent form so an individual agent can opt in/out regardless
   of the default.
3. A **non-blocking warning** when starting an in-place agent while another in-place agent is
   already running in the same repo (they share one working tree).

## Non-goals (YAGNI)

- No per-project worktree preference. The choice is global default + per-agent override.
- No blocking or locking on concurrency — warn only.
- No changes to the existing-branch / existing-PR / non-git-folder flows. They already run in place
  (`noWorktree: true`) and stay as-is.

## Background: how `noWorktree` already works

`SessionCreator.create` (`src/main/session/session-creator.ts:36`) already branches on
`noWorktree`:

- **Non-git folder** → `noWorktree` is forced; runs in the folder (`session-creator.ts:50-51`).
- **`stayOnBranch`** → runs on the currently checked-out branch in the main repo
  (`session-creator.ts:52-54`).
- **`existingBranch`** → `git checkout <branch>` in the main repo (`session-creator.ts:55-59`).
- **`prIdentifier`** → fetch PR branch, `git checkout` it in the main repo
  (`session-creator.ts:60-66`).
- **new branch in place** → `assertCleanWorkingTree` then `git checkout -b <newBranch>` in the main
  repo (`session-creator.ts:67-74`). **This path is implemented but currently unreachable from the
  UI** — no caller sends `noWorktree: true` without also setting `stayOnBranch`/`existingBranch`/
  `prIdentifier`. This feature lights it up.

When `noWorktree` is set, the creator skips worktree-meta reads/writes
(`session-creator.ts:147`, `:187`) and marks the session `noWorktree: true`
(`buildSession`, `session-creator.ts:259`). No changes to `session-creator.ts` are required.

## Design

### 1. Setting: `useWorktrees: boolean` (default `true`)

- Add `useWorktrees: boolean` to `ManifoldSettings` (`src/shared/types.ts:146`).
- Add `useWorktrees: true` to `DEFAULT_SETTINGS` (`src/shared/defaults.ts`). Default `true`
  preserves current behavior. Existing configs that lack the field merge to `true` via
  `SettingsStore.resolveDefaults` (`{ ...DEFAULT_SETTINGS, ...parsed }`), so no migration is needed.
- Positive framing (`useWorktrees`) over negative (`defaultNoWorktree`) to avoid double negatives in
  UI and code.

### 2. Settings UI

In `GeneralSettingsSection.tsx`, "Workspace" `SectionCard` (`src/renderer/components/modals/settings/GeneralSettingsSection.tsx:53`),
add a full-width checkbox following the existing `checkboxField` pattern:

> ☑ **Create an isolated git worktree for each new agent**
> *Off: agents run directly in the repository on a new branch. Only one in-place agent can safely
> run per repo at a time.*

Wiring mirrors `autoGenerateMessages`: add `useWorktrees` + `onUseWorktreesChange` props to
`GeneralSettingsSection`, pass through `SettingsModalBody` / `SettingsModal`, and call
`updateSettings({ useWorktrees })` from the existing `useSettings` hook. No new IPC — the generic
`settings:update` channel already handles arbitrary partials.

### 3. New Agent form — per-agent override

Thread the default down the **existing** `defaultAgentMode` prop chain:

- `App.tsx:293` already reads settings for this panel — add
  `defaultUseWorktrees: settings.useWorktrees ?? true`.
- `dock-agent-panel.tsx` / `dock-panel-types.ts` / `OnboardingView.tsx` — add the prop alongside
  `defaultAgentMode`.
- `NewAgentForm` — accept `defaultUseWorktrees`, hold it in `useState` (`worktreeEnabled`).

In `NewAgentAdvanced`, add a checkbox shown **only when not** "Continue on an existing branch or PR"
(`!useExisting`), since existing-branch/PR is inherently in-place:

> ☑ **Use an isolated worktree**

Submit logic (`NewAgentForm.handleSubmit`, the new-branch path that currently does `return base`):

```ts
// new-branch path (not useExisting)
return worktreeEnabled ? base : { ...base, noWorktree: true }
```

- `worktreeEnabled === true` → unchanged: `createWorktree` runs (`session-creator.ts:94`).
- `worktreeEnabled === false` → `noWorktree: true`, no `existingBranch`/`stayOnBranch` → the
  new-branch-in-place path (`session-creator.ts:67-74`) creates a fresh branch in the main repo.

The existing-branch/PR branches of `handleSubmit` are unchanged (they already set `noWorktree: true`).

### 4. Warn-only concurrency note

`NewAgentForm` already receives the project's `existingSessions`. Compute a derived flag:

```ts
const inPlaceAgentRunning = existingSessions.some(
  (s) => s.noWorktree && (s.status === 'running' || s.status === 'waiting')
)
const willRunInPlace = !worktreeEnabled || useExisting
```

When `willRunInPlace && inPlaceAgentRunning`, render a non-blocking inline note above the start
control:

> ⚠ Another agent is already running directly in this repository. They share one working tree —
> running both at once can cause conflicts.

This does **not** disable submit. It is informational only.

## Data flow

```
Settings UI (checkbox)
  └─ updateSettings({ useWorktrees })  ──▶ settings:update IPC ──▶ SettingsStore ──▶ config.json
                                                                          │
App.tsx (settings.useWorktrees) ──prop──▶ dock-agent-panel ──▶ OnboardingView ──▶ NewAgentForm
                                                                          │
NewAgentForm (worktreeEnabled state, per-agent checkbox)
  └─ handleSubmit ──▶ onLaunch({ ..., noWorktree?: true }) ──▶ spawnAgent IPC
                                                                          │
SessionCreator.create  ──noWorktree?──▶  worktree path  |  in-place new-branch path (existing code)
```

## Components and ownership

| Unit | Responsibility | Change |
| --- | --- | --- |
| `src/shared/types.ts` | `ManifoldSettings.useWorktrees` | add field |
| `src/shared/defaults.ts` | default `useWorktrees: true` | add default |
| `GeneralSettingsSection.tsx` | global toggle UI | add checkbox + props |
| `SettingsModalBody.tsx` / `SettingsModal.tsx` | pass setting through | thread prop/handler |
| `App.tsx`, `dock-agent-panel.tsx`, `dock-panel-types.ts`, `OnboardingView.tsx` | prop chain | add `defaultUseWorktrees` |
| `NewAgentForm.tsx` | per-agent state + submit logic + warning | add checkbox state, branch logic, warning |
| `NewAgentAdvanced.tsx` | render per-agent checkbox | add checkbox (when `!useExisting`) |
| `src/main/session/session-creator.ts` | in-place new-branch spawn | **no change** (already implemented) |

## Error handling

- **Dirty working tree** when starting an in-place new-branch agent: `assertCleanWorkingTree`
  already throws a clear message (`session-creator.ts:214-222`); `NewAgentForm`'s existing
  try/catch surfaces it as the form error. No new handling.
- **Settings persistence failure**: `useSettings.updateSettings` already sets an error state;
  unchanged.

## Testing

- `settings-store.test.ts` — `useWorktrees` defaults to `true`; round-trips through update.
- `NewAgentForm.test.tsx` —
  - default-on: new-branch launch omits `noWorktree` (worktree created);
  - default-off (or checkbox unchecked): new-branch launch sends `noWorktree: true`;
  - existing-branch/PR still send `noWorktree: true` (unchanged);
  - warning renders only when `willRunInPlace && inPlaceAgentRunning`.
- `session-creator.test.ts` — add a case for the pure in-place new-branch path: `noWorktree: true`
  with no `stayOnBranch`/`existingBranch`/`prIdentifier` → `assertCleanWorkingTree` +
  `git checkout -b` in `project.path`, session marked `noWorktree`, no worktree-meta write. (Existing
  cases only cover `noWorktree + stayOnBranch`.)
- `GeneralSettingsSection` rendering test for the new checkbox if a sibling pattern exists.

## Documentation (CLAUDE.md §5)

- `docs/architecture/store.md` — document the `useWorktrees` setting; bump `updated:`.
- `docs/architecture/renderer.md` — note the New Agent worktree toggle + concurrency warning.
- `docs/architecture/session.md` — only if its text claims agents *always* get a worktree; correct
  to "worktree by default, or in-place when `noWorktree` is set."
- Verify every cited `file:line` against current code; a non-writer pass certifies.

## Open questions

None. Defaults chosen: setting default `true` (preserves behavior); per-agent override in Advanced;
new-branch-in-place when off; warn-only on concurrency.
