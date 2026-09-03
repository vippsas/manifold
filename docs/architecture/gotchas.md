---
description: The top recurring development traps in Manifold — StrictMode double-mount, the better-sqlite3 Node↔Electron ABI flip, worktree bootstrap, dockview layout restore/width-0, terminal-query replay, and folder projects that silently share one checkout — each paired with the checked-in guardrail (test/script/doc) that pins it, cited to file:line.
covers: [src/renderer/components/modals/useNewAgentForm.tsx, scripts/rebuild-better-sqlite3-node.mjs, scripts/setup-worktree.sh, src/renderer/hooks/dock-layout/dock-layout-lifecycle.ts, src/renderer/hooks/terminal/terminal-replay.ts, src/shared/project-kind.ts]
updated: 2026-09-02
owner: see .github/CODEOWNERS
---

# Gotchas — the recurring traps and the guardrails that pin them

A fresh agent or contributor in a fresh worktree keeps rediscovering the same few
traps: the right symptom points at the wrong root cause, so the fix misses. Those
lessons used to live only in per-machine agent memory, invisible to anyone else. This
page promotes the highest-leverage ones into the repo itself — each trap paired with the
checked-in guardrail (a test, a script, or deeper docs) that already prevents it, cited
to `file:line`. Read the symptom, jump to the guardrail.

Each guardrail is *code*, not prose: a test that fails on regression, a script that
refuses the bad setup, or a `pre*` hook that self-heals. The prose here only points at
it.

**How this page is triggered.** Two ways, both automatic. *Discovery* — a fresh agent is
pointed here by CLAUDE.md §5 (auto-loaded into every session) and by the doc map's
"Cross-cutting guardrails" row ([`docs/README.md`](../README.md)), so it reads the trap
before rediscovering the root cause. *Freshness* — the `covers:` paths below bind this
page to their canonical files, so `bash scripts/wiki-lint.sh` and the daily
[`wiki-doc-sync`](../../.claude/skills/wiki-doc-sync/SKILL.md) routine flag it for review
when any of that code changes.

## Covered code

This page is bound to the canonical file for each trap, so the wiki lint flags it for
review when one of them changes:

- `src/renderer/components/modals/useNewAgentForm.tsx` — the StrictMode mounted-ref pattern.
- `scripts/rebuild-better-sqlite3-node.mjs` — the self-healing Node-ABI rebuild.
- `scripts/setup-worktree.sh` — `npm run bootstrap`, the one-step worktree setup.
- `src/renderer/hooks/dock-layout/dock-layout-lifecycle.ts` — the dockview width-0 guard.
- `src/renderer/hooks/terminal/terminal-replay.ts` — the replay query-stripping guard.
- `src/shared/project-kind.ts` — the folder-project rule that denies worktrees.

Deeper, subsystem-level coverage lives in [Renderer](renderer.md) and
[Build & release](build.md); this page is the cross-cutting index of the traps that bite
most often.

## 1. StrictMode double-mounts every component in dev

**Symptom.** A component works in the packaged app but hangs or drops an async result
under `npm run dev` — the canonical case was the New Agent form stuck on "Starting…".

**Root cause.** The renderer mounts under `<React.StrictMode>`
(`src/renderer/index.tsx:16`), so in dev every effect runs setup → cleanup → setup on
first render (and after any real unmount/remount). A `useRef(true)` "is-mounted" flag
that a cleanup flips to `false` — but the effect body never sets back to `true` — sticks
at `false` after the remount, so later callbacks gated on `mountedRef.current` are
silently skipped.

**Guardrail.** Set the flag in the effect *body*, not only in cleanup
(`useNewAgentForm.tsx:51-60`, `useIpc.ts:16-21`). Test the component wrapped in
`<React.StrictMode>` so the remount actually happens: `NewAgentForm.test.tsx:108`, and
the reusable **StrictMode double-mount test template** at
`src/renderer/test-utils/strict-mode.test.tsx` (helper: `strict-mode.test-helpers.tsx`,
`renderWithStrictMode`). The template's three tests are an executable proof that the
harness catches this class: the buggy variant hangs *only* under StrictMode, the fixed
variant does not, and a bare `render()` (like a packaged-build click-through) mounts once
and hides the difference. That is why manual verification of the `.dmg` misses it — only
a StrictMode unit test catches it deterministically.

## 2. better-sqlite3 is built for one ABI at a time (Node ↔ Electron)

**Symptom.** After `npm run dev`, `npm test` can't load `better-sqlite3`
(a `NODE_MODULE_VERSION` mismatch, or "Module did not self-register"), or vice-versa.

**Root cause.** The one native dependency ships a `.node` addon compiled for a single
runtime's ABI. Tests run under **Node**; the app runs under **Electron**. Running one
after the other leaves SQLite built for the wrong ABI.

**Guardrail.** The `pre*` hooks flip it back automatically — `pretest` runs `rebuild:node`
while `predev`/`prestart`/`predist` run `rebuild:electron` (`package.json:19`, `:9`, `:13`,
`:23`; the `rebuild:*` scripts themselves are defined at `:26-27`). The Node rebuild
self-heals and is a near-no-op when already correct: it probes
in a **fresh subprocess** (a process that already failed to load the wrong-ABI binary
can't re-`dlopen` the rebuilt one) and rebuilds only on a real ABI error
(`scripts/rebuild-better-sqlite3-node.mjs:7`, `:35-37`). `npm run doctor` reports
which ABI is currently loaded (`scripts/doctor.mjs:92`, `:221`). Full "Native-module
rebuild story" in [Build & release](build.md); made self-healing in #841.

## 3. A fresh or symlinked worktree isn't runnable until bootstrapped

**Symptom.** `npm run dev` fails with `Error: Electron uninstall`, or vitest `?url`
imports break, in a newly created worktree.

**Root cause.** A fresh worktree has no `node_modules`. Symlinking it from another clone
leaves Electron half-installed (missing `node_modules/electron/path.txt`) and breaks some
vitest `?url` imports — a real install is the supported setup.

**Guardrail.** `npm run bootstrap` (`scripts/setup-worktree.sh`) refuses a symlinked
`node_modules` (`:14`), runs a real `npm install`, asserts the Electron binary actually
downloaded — the missing `path.txt` is the `Error: Electron uninstall` symptom
(`:25-29`) — and rebuilds SQLite for Electron (`:37-38`). `npm run doctor` reports whether
a worktree is runnable. See CLAUDE.md §7 and [Build & release](build.md).

## 4. Dockview layout: width-0 while maximized, and collapse doesn't survive `fromJSON`

**Symptom.** Sidebar widths get corrupted after entering/leaving focus mode; a collapsed
sidebar reopens after an app restart; a layout save throws on an
already-disposed dockview during a StrictMode remount / onboarding transition; a rebuilt
layout opens with the sidebar at **1/2** width instead of 1/6 — but only in repos whose
previous layout had a bottom pane; or dividers intermittently stop being resizable
(no resize cursor) after opening/closing a panel, until the window is resized. Or: clicking
an activity-bar icon off and on repeatedly walks a sidebar steadily narrower — ~12px a
cycle, never recovered — so "clicking back and forth" jumps and stutters instead of
returning to the same layout.

**Root cause.** (a) While a group is maximized, every other group — the sidebar
included — is hidden, so its `offsetWidth` reads **0**; capturing widths then would
persist zeros. (b) dockview's `toJSON` drops `minimumWidth <= 0`, so a collapsed (width-0)
sidebar is not preserved across an `api.fromJSON` reload. (c) A debounced layout save can
fire `api.toJSON()` after the dockview is disposed. (d) The grid **orientation is sticky**:
`api.clear()` keeps whatever the last `fromJSON` set, so rebuilding the default layout on a
VERTICAL-rooted grid nests the columns inside a wrapper branch where the 1:5 ratio
patch used to miss them — equal halves (#803). (e) Reopening panels into an **emptied**
dock: the first reopened panel (typically `sidebar`) owns the full dock width, and
`withPinnedSidebars` used to pin it there during every subsequent add — clamping each new
group to width 0, so the panels existed but rendered invisible until `sidebar` was
toggled closed and open again. (f) dockview re-evaluates each sash's enabled state only
during a layout pass (`updateSashEnablement`), never on `setConstraints` alone: the pass a
pinned mutation triggers marks the sashes next to min==max groups `dv-disabled`, and
releasing the pin afterwards left them stuck that way — dividers dead until an unrelated
relayout. (g) **`setSize` and `api.width` are not the same measurement.** `setSize` sets the
view's *slot* in the splitview, which carries that view's share of the theme's group gap
(`gap: 6`, `AppShell.tsx:43`), while `api.width` reports the rendered width the slot leaves
behind — dockview lays each view out at `size - margin * sashes / views`
(`dockview-core/…/splitview.js:791,843`). So both halves of the pin were off by that share:
pinning to a measured `offsetWidth` rendered the group 3-4px narrower on the next layout
pass, and the release poke fed `api.width` back into `setSize` and shaved it again. Four pin
cycles run per panel toggle, hence ~12px lost per off/on and a layout that never returned to
where it started.

**Guardrail.** (a) Skip the width bookkeeping and the save while a group is maximized
(`dock-layout-lifecycle.ts:41`). (b) Re-apply the saved sub-minimum sidebar widths right
after `fromJSON` so the collapse survives (`dock-layout-loader.ts:89`). (c) Clear the
pending debounced save on unmount (`useDockLayout.ts:247-252`). (d) Promote wrapper roots
(flipping the serialized orientation) before patching the ratio
(`dock-layout-builders.ts:45`). (e) Skip the sidebar pin when it would leave no unpinned
group to absorb the change (`dock-layout-sidebar-width.ts:123`), and after a hint-based reopen
restore the default proportions — a reopened sidebar is sized to its 1/6 share, and a
reopened center pane shrinks a sidebar that had grown past a third of the dock back to
1/6 (`dock-layout-loader.ts:245-270`) — since `addPanel` naively splits the reference
group 50/50. A group the user has dragged a workspace pane into is exempt from both
shrinks — it is a center pane, not a sidebar (`isPureSidebarGroup`,
`dock-layout-loader.ts:28`). (f) Releasing a pin
pokes a same-size `setSize` on the group (`dock-layout-sidebar-width.ts:50`), which triggers a
relayout that re-runs the enablement check against the released constraints — chosen over
a forced `api.layout()` because a forced pass re-applies the splitview's stale cached
proportions and undoes the pinned resize. (g) Ask for widths in *rendered* terms:
`setRenderedWidth` sets the size, measures what the gap took, and asks again for the slot
that lands on the width wanted (`useSidebarHandleCycle.ts:75`); `withPinnedSidebars` then
holds the sidebar to the width it promised once the mutation is done, rather than trusting
the constraint clamp (`dock-layout-sidebar-width.ts:141`). The regression tests drive the
**real** dockview library
and the **real** layout helpers rather than an approximation:
`dock-layout-no-remount.test.tsx`, `useSidebarHandleCycle.collapse.test.tsx`,
`dock-layout-default-ratio.test.tsx`, `dock-layout-reopen-empty.test.tsx`,
`dock-layout-sash-enablement.test.tsx` (inspects the real sash DOM for stuck
`dv-disabled` classes), `dock-layout-toggle-drift.test.tsx` (drives five close/reopen cycles
against a dock with the app's real `gap`, asserting the sidebar ends where it began),
`dock-layout-pane-homes.test.tsx` (drives every open/close order onto the one canonical
arrangement — see (h) below), and
`dock-layout-drag-restore.test.tsx` — the last
wires `element.offsetWidth` to dockview's tracked group width because jsdom has no layout
engine (`:30-36`). (h) **A direction is relative to the reference pane's *cell*, not to the
region you meant** — `addPanel(agent, 'below')` puts the shell under the agent's column
alone, so the same panes arrange differently depending on the order they were opened in;
and a pane closed under another lets dockview promote its sibling branch to the root,
flipping the sticky orientation. Both are pinned by giving every pane one home and
re-asserting it on open — never replaying a snapshot's position
(`PANEL_RESTORE_HINTS`, `dock-layout-model.ts:35`; `spanShellAcrossWorkspace`,
`dock-layout-shell-span.ts:50`). More in [Renderer](renderer.md).

## 5. Replaying raw terminal output re-answers the queries baked into it

**Symptom.** Switching to another agent or shell types garbage into the program that is
already running there — classically `;1R;1R;1R;1R` at a Claude Code or shell prompt. It
looks like a key-handling or `/add-dir` bug, because the burst lands right after an action
that switches views.

**Root cause.** `useTerminal` restores a session by writing its raw `outputBuffer` into a
freshly created xterm.js (`useTerminal.ts:228`). xterm.js does not distinguish live output
from history: it *answers* the terminal queries it parses. Each `ESC[6n` in the replayed
bytes makes it emit `ESC[<row>;<col>R`, each `ESC[c` makes it emit `ESC[?1;2c`, both
through `onData` — which the same hook forwards to the live PTY as if the user had typed
it (`useTerminal.ts:285`). The input filter passes cursor reports through on purpose, so
the GitHub CLI auth prompt doesn't hang (`terminal-input-filter.ts:3-7`). Codex sends one
`ESC[6n` on startup and one per resize, and codex and Claude Code each send one `ESC[c` on
startup, so a session's buffer holds several and every view switch replays the whole burst.
How that surfaces is up to whatever is reading the PTY: a reader whose key parser walks
`ESC[<row>` as a sequence prefix and then gives up leaves the unmatched `;1R` tail in its
input line, and a shell that is not in raw mode gets the whole thing kernel-echoed as
`^[[7;1R`. Either way the app injected input nobody typed.

**Guardrail.** Strip the queries from the replayed buffer — history was already answered
by whichever terminal was attached at the time — and leave the live path alone
(`stripTerminalQueries`, `hooks/terminal/terminal-replay.ts:30`). Pinned by
`terminal-replay.test.ts`, which drives the **real** `@xterm/xterm` over the real replay
path: one test asserts nothing reaches the PTY after stripping, its twin asserts the
unstripped buffer still yields one stale report per query, so the mechanism itself stays
pinned and cannot silently drift.

**Generalizes.** Any historical byte stream fed back into a stateful emulator can trigger
a reply the peer never asked for. The strip covers the queries the runtimes were actually
measured emitting (cursor position and device attributes); xterm.js also auto-answers
DECRQM, DECRQSS, window-size reports and OSC color queries, and only the color *replies*
are dropped on the input side (`terminal-input-filter.ts:10`). If new garbage appears on a
view switch, suspect the replay before the key handler, and check that census first.

## 6. A folder project never gets a worktree, however loudly you ask

**Symptom.** Code that spawns a child agent with `newWorktree: true` finds the child
working in the project directory itself. Two children share one checkout, so anything
that resets or cleans "its own" worktree is really operating on the user's working copy.

**Root cause.** `isGitProject()` is false for `kind: 'folder'`
(`src/shared/project-kind.ts:3`), so `SessionCreator` computes `noWorktree` and returns
`{ path: project.path }` for every such session, ignoring the requested worktree
(`session-creator.ts:41`, `:55`). A folder project is worked in place by design; the
request is not refused, it is silently satisfied with the shared directory. Viola hit
this: implementer and reviewer landed on one checkout and the review step ran
`git reset --hard` plus `git clean -fd` in it.

**Guardrail.** Never trust a spawn's worktree — compare it against the orchestrator's own
path and fail the task when they match (`src/main/viola/task-pipeline.ts:167`), and refuse
the work up front when the project cannot host worktrees at all
(`src/main/viola/engine.ts:73`). Any destructive git primitive must additionally prove its
target is a linked worktree, comparing git's own absolute `--git-dir` and
`--git-common-dir` so a symlinked prefix (macOS `/var` vs `/private/var`) cannot defeat the
check (`src/main/viola/git.ts:54`). `viola/git.test.ts` pins both halves: a linked-worktree
apply, and a main checkout that must survive with its uncommitted edits intact. See
[Viola](viola.md).

## 7. A TUI agent cannot be asked whether it is ready for a prompt

**Symptom.** Either an orchestrated interactive worker never acts on the prompt it was sent (no
turn starts, no API traffic, idle at 0 % CPU until a timeout), or a *healthy* worker is failed for
never becoming ready.

**Root cause.** `detectStatus` returns `waiting` from a prompt-shaped character anywhere in recent
output, which a startup banner satisfies before a composer exists. Tightening that is a trap of its
own: codex accepts typing while its MCP servers start — one configured server allows 120 s — and a
TUI animates while idle, so requiring a finished startup and a quiet screen fails a worker that is
perfectly fine. A separate hazard: when a newer release exists codex opens an interactive
"Update now" menu on launch, and option 1 runs `brew upgrade --cask codex`.

**Guardrail.** Do not gate on readiness. Wait briefly for a composer, then send anyway, and make
an explicit artifact the only timeout (`src/main/viola/harness.ts:260`,
`src/main/viola/done-signal.ts`). Refuse only the screens whose Enter would act for the user, and
name them (`src/main/viola/worker-ready.ts:14`). Suppress the update menu at launch
(`src/main/agent/orchestrated-args.ts:19`). `worker-ready.test.ts` and `harness.test.ts` pin both
halves: send-anyway on an unparsed screen, and refusal on a dialog.

**A caution on evidence.** Driving these CLIs from a bare PTY is not a faithful test: codex queries
the terminal for its colours (OSC 10/11) and stalls when nothing answers, so a plain `node-pty`
harness never reaches the composer. Conclusions about TUI behaviour need the real app, or a
harness that answers those queries.

## 8. Verify against the real code path, not an approximation

Cross-cutting principle behind the guardrails above. A test that stubs the very thing
under test proves nothing; a green check must exercise the app's real imports and
lifecycle. The StrictMode template renders under the real `<React.StrictMode>` cycle; the
dockview regression tests import the real `dockview` package and drive the real layout
helpers rather than reimplementing them (`dock-layout-no-remount.test.tsx:1-5`). When a
dependency genuinely can't be reached offline (a live DB, a SaaS API), isolate it behind
a boundary and fake *that boundary* — but keep the code under test real, and record what
could only be confirmed against the live system.

## Interactions

- **[Renderer](renderer.md)** — subsystem-level detail for traps #1 and #4 (the
  StrictMode note and the collapsed-sidebar / focus-mode behavior live in its
  "Invariants & gotchas").
- **[Build & release](build.md)** — subsystem-level detail for traps #2 and #3 (the
  native-module rebuild story and the worktree bootstrap/doctor flow).
- **CLAUDE.md §7** — the worktree-setup rule this page's trap #3 summarizes.
- **[Renderer](renderer.md)** — where the terminal hook of trap #5 sits in the panel tree.
- **[Viola](viola.md)** — subsystem-level detail for traps #6 and #7 (isolation preconditions,
  the destructive-apply guard, and TUI readiness).
- **Test template** — `src/renderer/test-utils/strict-mode.test.tsx` is the copyable
  guardrail for trap #1; copy it next to a component and swap in the real one.
