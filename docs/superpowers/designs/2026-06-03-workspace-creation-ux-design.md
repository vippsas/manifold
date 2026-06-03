# First-class workspace creation (two-tier sidebar) — design

**Status:** Design (awaiting review)
**Date:** 2026-06-03
**Related:** `docs/superpowers/designs/2026-06-02-workspaces-design.md` (the Workspaces feature this refines)

## Summary

Make **creating a workspace** a first-class, discoverable action and stop the
New-Agent flow from kicking the user out of their active workspace. Today the
only way to create a workspace is to click **+ New Agent**, then find a faint
**+ New Workspace** ghost link buried at the bottom of the New-Agent onboarding
view — conceptually backwards, since a workspace *contains* agents, not the
reverse.

This is a **renderer-only** change. No IPC, main-process, or data-model changes:
the `workspace:create` handler, `NewWorkspaceModal`, and the `onNewWorkspace`
handler all already exist — they are simply surfaced in a better place.

## Chosen model: clean two-tier (the VS Code model)

We keep two tiers, mirroring VS Code / Cursor (which the Workspaces design
explicitly models on):

- A **single repo** is a lightweight repo-with-agents. No workspace required, no
  ceremony — open it and spawn agents.
- A **workspace** is a deliberately named grouping of **2+ repos**. The word
  "workspace" only appears once such a group exists.

This was chosen over "unify everything into a workspace" because the reference
design (VS Code/Cursor) deliberately does *not* wrap every single folder in a
workspace — forcing a user to name a container just to work in one repo is
friction they resent. A consequence we honor below: we do **not** show an empty
"Workspaces" section to single-repo users.

## The design

```
  Workspaces            [+]          <- header "+" appears only when section exists
    v auth-refactor (active)
        api            |>  x
          * agent-1
        web            |>
  Repositories
    my-app                           <- single repo: lightweight, no workspace
      * agent-2
  ----------------------------------
  [ + New Agent in auth-refactor ]   <- context-aware: workspace active -> spawns into it
  [ + New Workspace ]                <- NEW first-class action (always present)
  [ + New Repository ]
```

When a plain repo (not a workspace) is active, the top button is just
`[ + New Agent ]` and behaves exactly as today.

### Section 1 — First-class "New Workspace" (discoverability)

- Add a **`+ New Workspace`** button to the sidebar footer
  (`ProjectSidebar.tsx:124-131`), wired to the existing `onNewWorkspace` handler
  (`App.tsx:211` → opens `NewWorkspaceModal`). It is **always visible**, so the
  action is discoverable even at zero workspaces. Styled as a secondary
  `sidebar-action-button` (New Agent remains the primary).
- When the Workspaces section is present (≥1 workspace), also add a small **`+`**
  icon button to its header (`WorkspaceList.tsx:62`) as a convenience, wired to
  the same handler. It reuses the existing `sidebar-icon-button` /
  `sidebarStyles.addButton` styling already used for per-workspace add buttons.
- The Workspaces section **stays conditional** (only renders with ≥1 workspace —
  `WorkspaceList.tsx:58` unchanged). Per the two-tier model we do not nag
  single-repo users with an empty "advanced" section.

The `NewWorkspaceModal` already supports adding repositories inline (its
"Add Repository" control), so a user with 0–1 repos can still assemble a
workspace from the modal.

### Section 2 — Agents stay in their workspace (conceptual flow)

Today the footer **+ New Agent** is wired to `onNewAgentFromHeader`
(`App.tsx:207`), which calls `setActiveWorkspaceId(null)` — it actively ejects
the user from the active workspace before opening the loose New-Agent form.

Change: when a workspace is active, the footer button becomes
**`+ New Agent in {name}`** and spawns into that workspace via the **existing**
`onSpawnWorkspaceAgent` path (`App.tsx:217`) — the same quick-spawn the per-repo
`▶` button already uses (`WorkspaceList.tsx:186`). When no workspace is active
the button is unchanged (`+ New Agent` → `onNewAgent`).

`ProjectSidebar` already receives `workspaces`, `activeWorkspaceId`, and
`onSpawnWorkspaceAgent`, so the branching lives in the component:

```
const activeWorkspace = activeWorkspaceId
  ? workspaces?.find((w) => w.id === activeWorkspaceId)
  : undefined

// label: activeWorkspace ? `+ New Agent in ${activeWorkspace.name}` : '+ New Agent'
// onClick: activeWorkspace
//   ? onSpawnWorkspaceAgent(activeWorkspace.id)   // homeProjectId omitted -> primary repo
//   : onNewAgent()
```

Details:
- **Quick-spawn, not a form.** Workspace agents are already created by
  quick-spawn today; this keeps the behavior consistent and avoids making the
  single-project New-Agent form workspace-aware (a larger main-process change the
  Workspaces design notes as future work). `onSpawnWorkspaceAgent` already spawns
  the agent and selects its session.
- **Graceful fallback.** If `activeWorkspaceId` is set but no longer resolves to
  a workspace (e.g. just removed), fall back to the plain `+ New Agent` behavior.
- **Label truncation.** The workspace name in the label uses the existing
  `truncate` treatment so long names don't blow out the button.

### Section 3 — Remove the buried link

Delete the `+ New Workspace` `GhostLinkButton` from `OnboardingView.tsx:160-162`
— now redundant with the footer button and the section-header `+`. Also remove
the now-unused `onNewWorkspace` prop from `OnboardingView`
(`OnboardingView.tsx:84`), the pass-through at `dock-agent-panel.tsx:146`, and the
`GhostLinkButton` import if it becomes unused. The handler itself
(`s.onNewWorkspace`, `dock-panel-types.ts:88`) is retained — it is now consumed
by `ProjectSidebar` instead.

## Files touched

All renderer:

- **`src/renderer/components/sidebar/ProjectSidebar.tsx`** — add `onNewWorkspace`
  prop; add the `+ New Workspace` footer button; make `+ New Agent`
  context-aware; pass `onNewWorkspace` down to `WorkspaceList`.
- **`src/renderer/components/sidebar/WorkspaceList.tsx`** — add optional
  `onNewWorkspace` prop; render the `+` in the "Workspaces" section header.
- **`src/renderer/components/editor/dock-panels.tsx`** — forward
  `onNewWorkspace={s.onNewWorkspace}` to `ProjectSidebar` (line ~147).
- **`src/renderer/components/modals/OnboardingView.tsx`** — remove the ghost link,
  the `onNewWorkspace` prop, and a now-unused import.
- **`src/renderer/components/editor/dock-agent-panel.tsx`** — drop the
  `onNewWorkspace` pass-through to `OnboardingView` (line 146).

No changes to `src/main`, `src/preload`, `src/shared`, IPC channels, or
persisted data.

## Non-goals (v1)

- No "promote a repo to a workspace by adding a 2nd repo" auto-flow (a nice
  separate interaction; grouping still happens via `NewWorkspaceModal`).
- No workspace-aware New-Agent *form* (pre-seeded runtime/branch picker) — remains
  future work per the Workspaces design.
- No data-model, IPC, or main-process changes.
- No enforcement that a workspace must contain ≥2 repos (the model encourages it;
  we don't hard-block a 1-repo workspace).

## Testing strategy

Renderer component tests via vitest (`npx vitest run <file>`), extending the
existing `ProjectSidebar.test.tsx`:

- Footer `+ New Workspace` click calls `onNewWorkspace`.
- With **no** active workspace: the primary button reads `+ New Agent` and calls
  `onNewAgent` (existing test at `ProjectSidebar.test.tsx:113` continues to pass).
- With an active workspace: the primary button reads `+ New Agent in {name}` and
  calls `onSpawnWorkspaceAgent(workspaceId)` — not `onNewAgent`.
- Active workspace id that doesn't resolve falls back to `+ New Agent` /
  `onNewAgent`.
- `WorkspaceList` renders the header `+` and clicking it calls `onNewWorkspace`.

Then `npm run typecheck:web` (expect the known web baseline, no new errors).

## Success criteria

1. With zero workspaces, `+ New Workspace` is visible in the sidebar footer and
   opens `NewWorkspaceModal` directly — no trip through `+ New Agent`.
2. With ≥1 workspace, the "Workspaces" header shows a `+` that opens the same
   modal; single-repo users still see no empty Workspaces section.
3. With a workspace active, `+ New Agent in {name}` spawns an agent into that
   workspace and keeps the workspace active (no eject).
4. With a plain repo active, `+ New Agent` behaves exactly as before.
5. The buried `+ New Workspace` ghost link is gone from the New-Agent view; no
   unused props/imports remain; `typecheck:web` and the changed tests pass.
