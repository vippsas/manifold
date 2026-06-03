# Create workspace agents from the New-Agent form — design

**Status:** Design (awaiting review)
**Date:** 2026-06-03
**Related:** `docs/superpowers/designs/2026-06-02-workspaces-design.md` (deferred this), `docs/superpowers/designs/2026-06-03-workspace-creation-ux-design.md` (sidebar work this builds on)

## Summary

Replace the per-repo ▶ "quick spawn" inside a workspace with the **New-Agent
form**, so a workspace agent can be named and given a chosen AI/mode before it
starts — instead of silently spawning with the workspace's default runtime.

Flow: **select a repo inside a workspace → click "+ New Agent" → a trimmed
New-Agent view (name + AI + Interactive/Chat) → Start Agent.** The agent that
starts is exactly what the ▶ produces today — a **workspace (multi-root) agent
homed in the selected repo**, able to see the workspace's other repos — just
launched from the form so the runtime, name, and mode are the user's choice.

## Motivation

The ▶ on each workspace repo row calls `onSpawnWorkspaceAgent(workspaceId,
homeProjectId)`, which immediately spawns a workspace agent using
`workspace.runtimeId ?? defaultRuntime`, no prompt, no mode choice. Standalone
repos, by contrast, get the rich New-Agent form (`OnboardingView` /
`NewAgentForm`) where you name the agent, pick the AI, and choose Interactive vs
Chat. This is an inconsistency: the most capable creation path is unavailable
exactly where cross-repo work (the reason to use a workspace) happens. This is
the "workspace-aware New-Agent flow" the Workspaces design left as future work.

## Interaction design

1. **Select a repo.** Clicking a repo row inside the active workspace selects it
   (highlights it; the workspace stays open). The row is no longer a spawn
   trigger — the ▶ is removed.
2. **Open the form.** Clicking **"+ New Agent"** in the sidebar footer opens, in
   the agent panel, a **trimmed New-Agent view** titled "New agent for {repo}".
   It shows: the **name/prompt** input (optional), the **AI / runtime** picker,
   and the **Interactive / Chat** toggle. No "Advanced" (branch override, resume
   existing, PR import) — those are standalone-only and don't map to a workspace
   agent (whose branch is auto-generated and whose working set spans repos).
3. **Start.** "Start Agent" spawns a **workspace agent homed in the selected
   repo** with the chosen runtime, name/prompt, and mode — identical to the ▶'s
   result, plus the user's choices. The new agent is selected, as today.

If "+ New Agent" is clicked while a workspace is active but **no specific repo is
selected**, it defaults to the workspace's **primary repo** (`projectIds[0]`), so
the action is never a dead end.

## Architecture & components

**Removed:** the ▶ button in `WorkspaceList.tsx` repo rows (and its
`onSpawnAgent`-on-click). The refresh ↻ and remove × stay.

**Selection (renderer):** a workspace repo row becomes clickable and sets a
"selected workspace repo" context — the active workspace plus a home
`projectId`. This drives (a) which repo the footer "+ New Agent" targets and (b)
the "New agent for {repo}" title. It reconciles with the existing rule that a
focused workspace doesn't also highlight a standalone project
(`ProjectList.tsx:64`): the selected repo is highlighted *inside the workspace
card*, not in the standalone list.

**Trimmed form (renderer):** reuse `OnboardingView` / `NewAgentForm` with an
optional `workspaceContext = { workspaceId, homeProjectId }` prop. When present,
the form hides the Advanced/resume/branch/PR controls and, on submit, routes to a
**workspace launch** instead of the standalone `handleLaunchAgent`. Reusing the
existing component keeps the exact look the user expects and the name/AI/mode
controls already built; the prop just gates the standalone-only parts and the
launch target.

**Workspace launch (renderer):** extend the existing
`onSpawnWorkspaceAgent(workspaceId, homeProjectId)` to take the form's fields:
`onSpawnWorkspaceAgent(workspaceId, homeProjectId, { runtimeId, prompt,
nonInteractive })`. It already spawns + selects the resulting session.

**Main process:** `WorkspaceSpawnAgentOptions` (`src/shared/workspace-types.ts`)
gains `nonInteractive?: boolean` (it already has `runtimeId`, `prompt`,
`homeProjectId`, `branchName`). `workspace-manager.spawnAgent` passes
`nonInteractive` through to `sessionManager.createSession` (it already forwards
`prompt`, `runtimeId`, the multi-root working set, and `workspaceId`). No new IPC
channel — `workspace:spawn-agent` carries the extra field.

## Data flow

```
Select repo in workspace card  → sets { activeWorkspaceId, selected homeProjectId }
Click "+ New Agent" (footer)   → agent panel renders trimmed New-Agent view for that repo
Start Agent (name, AI, mode)
  → onSpawnWorkspaceAgent(workspaceId, homeProjectId, { runtimeId, prompt, nonInteractive })
  → workspace:spawn-agent (WorkspaceSpawnAgentOptions + nonInteractive)
  → WorkspaceManager.spawnAgent: build multi-root working set (home = selected repo,
       others = additionalDirs) → createSession({ workspaceId, prompt, runtimeId,
       nonInteractive, additionalDirs, ... })
  → new AgentSession selected in the dock (same as today's ▶)
```

## Non-goals (v1)

- No "Advanced" for workspace agents (branch override, resume existing session,
  PR import). Auto-branch only, as the ▶ does today.
- No change to standalone-repo agent creation.
- No multi-repo *selection* (you pick one home repo; the agent still spans the
  whole workspace as additional roots).
- No new IPC channel or data-model persistence changes beyond the one optional
  `nonInteractive` field on `WorkspaceSpawnAgentOptions`.

## Testing strategy

Renderer tests (vitest, extending `ProjectSidebar.test.tsx` and adding form
coverage):

- The ▶ button is gone from workspace repo rows; clicking a repo row selects it
  (fires the selection handler with the repo id).
- With a workspace repo selected, the footer "+ New Agent" opens the trimmed view
  (assert the workspace launch handler is wired, not the standalone one).
- The trimmed `NewAgentForm` (given `workspaceContext`) does **not** render the
  Advanced/resume controls.
- "Start Agent" calls `onSpawnWorkspaceAgent` with `{ runtimeId, prompt,
  nonInteractive }` for the selected home repo.

Main test (`workspace-manager.test.ts`): `spawnAgent` forwards `nonInteractive`
to `createSession`.

`npm run typecheck:web` + `typecheck:node` with no new errors vs baseline.

## Success criteria

1. A workspace repo row has no ▶; the ↻ and × remain.
2. Selecting a workspace repo and clicking "+ New Agent" shows "New agent for
   {repo}" with name + AI + Interactive/Chat and no Advanced section.
3. Start Agent spawns a workspace agent homed in the selected repo, multi-root
   (it can read/edit the workspace's other repos), with the chosen runtime/mode,
   and selects it — matching the old ▶ behavior plus the user's choices.
4. "+ New Agent" with a workspace active but no repo selected defaults to the
   primary repo.
5. Changed-file tests + `typecheck:web`/`typecheck:node` pass.
