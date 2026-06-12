# "Behind origin" Badge on the Refresh Button — Design

## Goal

Developers don't understand the sidebar repository card's refresh button (`↻`),
which fetches and fast-forwards the project's **base branch** from `origin`.
Clicking it before creating a new agent matters because **new agents branch off
whatever the local base branch is right now** — `session-creator.ts` does no
fetch of its own, so a stale local `main` means the agent forks from stale code.

Make the button speak up **only when a click would actually pull in new work**:
show a small count badge on `↻` when the base branch has fallen behind `origin`.
No badge when even — so it adds zero friction and zero noise the rest of the time.

## Approach

"Signal when stale," scoped to the card's refresh button only (confirmed with
user). Manifold learns the remote state on its own via a **read-only background
probe** (a `git fetch` that updates `FETCH_HEAD` but never moves the local
branch), triggered on launch and on window focus (throttled). The probe count
drives a badge + a state-aware tooltip on the existing button. The button's
click behavior is unchanged — it still does the real fast-forward.

Rejected alternatives (discussed with user): auto-fetch on New Agent (changes
behavior, adds latency), prompt at creation time (more scope than wanted),
tooltip-only (doesn't tell you *when* to click).

## Data flow

```
app launch / window focus (throttled ≥3 min per project)
  → useBranchStaleness  (sidebar container, beside useFetchProject)
  → invoke('git:staleness', projectId)
  → main: git-handlers → gitOps.getRemoteBehindCount(project.path, project.baseBranch)
        git fetch origin <baseBranch>                  # updates FETCH_HEAD only
        git rev-list --count <baseBranch>..FETCH_HEAD  # commits behind
      → { baseBranch, behindCount }   (behindCount = 0 on ANY error)
  → Record<projectId, behindCount> in the hook
  → ProjectItem behindCount prop → badge on ↻ + state-aware tooltip

manual ↻ click (unchanged path)
  → useFetchProject.fetchProject → invoke('git:fetch') → fetchAndUpdate (ff-merge)
  → onSuccess(projectId) → useBranchStaleness sets that project's count to 0
```

The probe is deliberately distinct from the existing `fetchAndUpdate`
(`git-operations.ts:57`), which fetches all refs **and** fast-forwards. The probe
is non-mutating: it learns the remote tip without moving the local branch under
the developer. Counting against `FETCH_HEAD` (rather than `origin/<base>`) is
robust regardless of the remote-tracking refspec configuration.

## Components / changes

1. `src/main/git/git-operations.ts` — **new** method
   `getRemoteBehindCount(projectPath, baseBranch): Promise<number>`, mirroring the
   existing `getAheadBehind` (`:95`): runs `git fetch origin <baseBranch>` then
   `git rev-list --count <baseBranch>..FETCH_HEAD`; returns the parsed count, and
   returns `0` on any thrown error (offline, no `origin`, missing branch).

2. `src/main/ipc/git-handlers.ts` — **new** handler `git:staleness`
   `(projectId) → { baseBranch, behindCount }`, beside `git:fetch` (`:99`). Same
   guards: project exists, `isGitProject`. A probe failure resolves to
   `behindCount: 0` and is logged quietly (no error propagated to the UI). Add
   `'git:staleness'` to the explicit channel allowlist in `src/preload/index.ts`
   (alongside `'git:fetch'` at `:77`).

3. `src/renderer/hooks/useBranchStaleness.ts` — **new** hook. Input: the list of
   git projects shown in the sidebar. Maintains `Record<projectId, number>` and a
   `lastCheckedAt` ref per project. Re-probes:
   - **on mount** (app launch) — all git projects
   - **on `window` `focus`** — only projects whose `lastCheckedAt` is older than
     `STALENESS_THROTTLE_MS` (**3 min**), with a small concurrency cap so many
     favorites don't spawn a burst of `git` processes
   Exposes `behindCounts` and a `markFresh(projectId)` that zeroes one entry
   (called on manual-fetch success).

4. `src/renderer/hooks/useFetchProject.ts` — no signature change; its existing
   `onSuccess(projectId)` callback (`:13,46`) is wired by the sidebar container to
   `useBranchStaleness.markFresh`, so a successful manual fetch clears that
   project's badge immediately.

5. Sidebar container (the component that already owns `useFetchProject` and renders
   `ProjectItem`) — instantiate `useBranchStaleness`, pass each project's
   `behindCount` down, and connect `useFetchProject`'s `onSuccess` to `markFresh`.

6. `src/renderer/components/sidebar/ProjectItem.tsx` — **new** optional prop
   `behindCount?: number`. On the existing fetch button (`:126-138`):
   - `behindCount > 0` && not fetching → `↻` with a superscript count badge
     (capped `9+`), in an **attention accent distinct from the gold favorite
     star** (exact design token confirmed against the `design` skill at
     implementation; token-use precedent is `var(--error, #f44)` at `:160`)
   - `title`/`aria-label` become state-aware:
     `"<base> is N commit(s) behind origin — fetch before starting a new agent"`
     when behind; today's `"Fetch latest from remote"` when even
   - `isFetching` still shows `...`; up-to-date renders a plain `↻` exactly as now
   The badge overlays the button (no new row, no layout shift).

## Error / edge handling

- Non-git folders, no `origin`, or a missing base branch → probe returns `0` →
  no badge. A background probe **never** raises a UI error or toast.
- The probe never moves the local branch; only the manual click fast-forwards.
- Background probe failures are swallowed for the UI but logged via the existing
  main-process logger (not silent at the log level).
- The 5-second fetch-result message, the star button, and the `×` button are
  untouched.

## Testing

- Unit (`git-operations` test, mocked `execFile`): `getRemoteBehindCount` returns
  the parsed count; returns `0` when a git call throws.
- Unit (`git-handlers.test.ts`): `git:staleness` guards — project-not-found and
  non-git both handled; probe error maps to `behindCount: 0`.
- Renderer (`useBranchStaleness` test): probes on mount; throttles repeat probes
  within the window on focus; `markFresh` zeroes a single project.
- Renderer (`ProjectItem` test): badge renders when `behindCount > 0`, hidden at
  `0`; tooltip/aria text flips between the even and behind strings.
- Manual: in the running app, with a base branch behind `origin`, confirm the
  badge appears, the tooltip explains it, clicking `↻` clears it, and an
  up-to-date repo shows no badge.

## Documentation (wiki)

In the same PR, bump the architecture page(s) `covers:`-bound to
`src/main/git/git-operations.ts` and the sidebar; if the sidebar staleness flow is
a new subsystem without a covering page, add one to the doc map. Run
`bash scripts/wiki-lint.sh` and resolve any drift.

## Defaults chosen (cheap to change)

Exact count (not a plain dot); **3-min** per-project focus throttle; **9+** badge
cap.

## Out of scope

New Agent flow changes, a just-in-time cue at the New Agent button, periodic
timer-based fetching, surfacing staleness for non-favorited/hidden projects,
auto-fast-forward.
