# Repo Indicator on Sidebar Workspace Rows — Design

## Goal

The Explorer sidebar lists every workspace by name and nothing else, so you
cannot tell which repository a workspace belongs to. In a long list — several
dozen rows, sorted by recency — rows like `moss`, `molde`, `steinkjer` and
`jessheim-4` sit beside each other with no way to know that the first is a
`kong` worktree and the rest are `manifold` ones.

Make the owning repo visible on every collapsed workspace row, without
restructuring the list.

## Why the current behaviour is inconsistent

The row renders `workspace.name` and nothing else
(`WorkspaceCard.tsx:153`). That name comes from two unrelated places:

- **Home workspaces** are named after their repo — `buildWorkspace(project.name,
  [project.id])` (`workspace-manager.ts:109,123`). Their name already *is* the
  repo, which is why `vops` and `vipps-configuration` read correctly today.
- **Worktree workspaces** are named after their branch, with only the literal
  `manifold/` prefix stripped (`workspace-promotion.ts:14-17`). But branches are
  prefixed with the *repo folder name*, not `manifold/`
  (`branch-namer.ts:53` — `path.basename(repoPath).toLowerCase() + '/'`).

So `manifold/jessheim-4` becomes `jessheim-4` and loses its repo, while
`kong/moss` keeps its prefix by accident. Every row that shows a repo today does
so by luck.

The repo is nevertheless already on the row as real data: `projectIds[0]` is the
primary repo (`workspace-types.ts`). It is simply never rendered until the card
is expanded (`WorkspaceCard.tsx:222-243`). **This is a presentation fix, not a
data one.**

## Approach

Render the repo as a **dimmed leading path segment** before the workspace name:
`kong / moss`. Chosen by the user from four variants mocked with real
`manifold-dark` tokens and real row metrics.

Rejected alternatives (all mocked and reviewed):

- **Grouping the list by repo** — adds a header row per repo, roughly doubles
  vertical space in a list that is mostly one workspace per repo, and fights the
  "one workspace expanded at a time" model (`WorkspaceList.tsx:60-62`).
- **Dimmed, right-aligned repo column** — better name-scanning (names keep a
  fixed left edge), but breaks with the `kong/moss` form already shown in the
  status bar and the agent terminal.
- **Dimmed suffix after the name** — repos do not line up, so it scans worse
  than the right-aligned variant while gaining none of the prefix form's
  consistency.

The accepted trade-off of the prefix form: because repo names vary in length,
workspace names no longer share a left edge (`manifold-server / narvik-2` starts
further right than `me / sandnes-2`). The user accepted this in exchange for
matching the `kong/moss` form used everywhere else.

## Label derivation

A pure helper in `src/renderer/components/sidebar/agent-labels.ts`, beside the
existing label helpers:

```ts
export interface WorkspaceRowLabel {
  /** Dimmed leading segment; null when it would only repeat the name. */
  repo: string | null
  /** The workspace's own name, with a redundant repo prefix removed. */
  name: string
}

export function workspaceRowLabel(
  workspace: Workspace,
  projects: Project[],
): WorkspaceRowLabel
```

Rules, applied in order:

1. Primary repo is `projects.find(p => p.id === workspace.projectIds[0])`. When
   it is not registered, return `{ repo: null, name: workspace.name }` — do not
   invent a label that cannot be verified.
2. Display repo is `project.name`. When the workspace spans more repos, append
   the count: `` `${project.name} +${workspace.projectIds.length - 1}` ``.
3. Strip a redundant prefix from `workspace.name` using the **path basename**,
   reusing `repoPrefix()` from `agent-labels.ts` (currently module-private —
   export it). `kong/moss` → `moss`; `jessheim-4` → unchanged.
4. If the stripped name equals the display repo case-insensitively, set
   `repo: null`. This is what keeps home workspaces reading `vops` rather than
   `vops / vops`.

Rule 4 is deliberately driven by the name/repo comparison rather than by
`worktreePaths === undefined` (the home-workspace test). A home workspace the
user has renamed — say `kong`'s home workspace renamed to `main dev` — then
correctly gains its `kong /` prefix, because the name no longer says the repo.

Step 3 uses `project.path`'s basename rather than `project.name` so the strip
matches the branch prefix by construction. The two are the same value today
(`project-registry.ts:99` sets `name: path.basename(resolvedPath)`), but the
path is what `branch-namer.ts:53` derives the prefix from, so it stays correct
if the two ever diverge. `project.name` remains the *displayed* label.

## Rendering

`WorkspaceCard.tsx:150-158` — the name span gains two dimmed nodes ahead of the
name, rendered only when `label.repo` is non-null:

```tsx
<span className="truncate" style={{ minWidth: 0 }}>
  {label.repo && (
    <>
      <span style={sidebarStyles.rowRepo}>{label.repo}</span>
      <span style={sidebarStyles.rowRepoSep}>/</span>
    </>
  )}
  {label.name}
</span>
```

New entries in `ProjectSidebar.styles.ts`:

- `rowRepo` — `color: 'var(--text-muted)'`, `maxWidth: '45%'`, `overflow:
  'hidden'`, `textOverflow: 'ellipsis'`, `flexShrink: 0`
- `rowRepoSep` — same color at `opacity: 0.55`, `margin: '0 3px'`,
  `flexShrink: 0`

No new theme tokens and no hardcoded colors: both reuse `--text-muted`, per the
design system's token-only rule.

**Truncation priority.** The name is the row's identity, so it truncates last.
The repo is capped at 45% of the row with its own ellipsis; the name stays
flexible with ellipsis. The row's `title` becomes the full composed label
(`kong/moss`) rather than the raw `workspace.name`, so the untruncated form is
always one hover away.

## Rename seeding

Double-click-to-rename currently seeds the draft with `workspace.name`
(`WorkspaceCard.tsx:153`). For a legacy row that means seeing `kong / moss` but
editing `kong/moss`. Seed the draft with the *displayed* name instead, so a
rename persists `moss` and the store heals one row at a time.

This is why `workspaceNameFor` (`workspace-promotion.ts:14-17`) is deliberately
left alone. The render path is required regardless — it is the only thing that
fixes the already-persisted names — so fixing the source as well would be a
second mechanism doing the same job, with a migration attached. Reviewed with
the user and explicitly deferred.

## Out of scope

- **Favorites rows** (`FavoritesList.tsx:53`) render a denormalized `fav.name`
  snapshot with no workspace lookup, so they need their own pass.
- **Agent dock tabs** (`DockTab.tsx:84`) render `session.displayName` with no
  repo and no tooltip — the original question that started this work. A separate
  follow-up.

## Verification

Unit tests for `workspaceRowLabel`, one per rule:

| Case | Expected |
|---|---|
| Home workspace, name equals repo | `{ repo: null, name: 'vops' }` |
| Worktree, repo-prefixed name | `{ repo: 'kong', name: 'moss' }` |
| Worktree, unprefixed name | `{ repo: 'manifold', name: 'jessheim-4' }` |
| Multi-repo workspace | `{ repo: 'platform-ai +2', name: 'sandnes' }` |
| Renamed home workspace | `{ repo: 'kong', name: 'main dev' }` |
| `projectIds[0]` not registered | `{ repo: null, name: <raw name> }` |

A `ProjectSidebar.test.tsx` case asserting the dimmed segment renders for a
worktree workspace and is absent for a home workspace.

Visual: `npm run screenshot:component ProjectSidebar --theme manifold-dark`
against the existing `ProjectSidebar.fixture.tsx`, confirmed to render before
the work is called done, so the user judges taste only. See
[renderer verification](../../architecture/renderer-verification.md).

Gates: `npm run typecheck:web`, `npm run typecheck:node`, and the test suite.

## Docs

`docs/architecture/` pages covering `src/renderer/components/sidebar/` get an
`updated:` bump in the same PR, per CLAUDE.md §5. Confirm coverage with
`bash scripts/wiki-lint.sh`.
