---
description: The top recurring development traps in Manifold — StrictMode double-mount, the better-sqlite3 Node↔Electron ABI flip, worktree bootstrap, and dockview layout restore/width-0 — each paired with the checked-in guardrail (test/script/doc) that pins it, cited to file:line.
covers: [src/renderer/components/modals/NewAgentForm.tsx, scripts/rebuild-better-sqlite3-node.mjs, scripts/setup-worktree.sh, src/renderer/hooks/dock-layout/dock-layout-lifecycle.ts]
updated: 2026-07-27
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

- `src/renderer/components/modals/NewAgentForm.tsx` — the StrictMode mounted-ref pattern.
- `scripts/rebuild-better-sqlite3-node.mjs` — the self-healing Node-ABI rebuild.
- `scripts/setup-worktree.sh` — `npm run bootstrap`, the one-step worktree setup.
- `src/renderer/hooks/dock-layout/dock-layout-lifecycle.ts` — the dockview width-0 guard.

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
(`NewAgentForm.tsx:75-83`, `useIpc.ts:16-21`). Test the component wrapped in
`<React.StrictMode>` so the remount actually happens: `NewAgentForm.test.tsx:241`, and
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
sidebar reopens after a session switch or app restart; a layout save throws on an
already-disposed dockview during a StrictMode remount / onboarding transition; a new
agent opens with both sidebars at **1/3** width instead of 1/6 — but only in repos whose
previous layout had a bottom pane; or dividers intermittently stop being resizable
(no resize cursor) after opening/closing a panel, until the window is resized.

**Root cause.** (a) While a group is maximized, every other group — including both
sidebars — is hidden, so their `offsetWidth` reads **0**; capturing widths then would
persist zeros. (b) dockview's `toJSON` drops `minimumWidth <= 0`, so a collapsed (width-0)
sidebar is not preserved across an `api.fromJSON` reload. (c) A debounced layout save can
fire `api.toJSON()` after the dockview is disposed. (d) The grid **orientation is sticky**:
`api.clear()` keeps whatever the last `fromJSON` set, so rebuilding the default layout on a
VERTICAL-rooted grid nests the three columns inside a wrapper branch where the 1:4:1 ratio
patch used to miss them — equal thirds (#803). (e) Reopening panels into an **emptied**
dock: the first reopened panel (typically `projects`) owns the full dock width, and
`withPinnedSidebars` used to pin it there during every subsequent add — clamping each new
group to width 0, so the panels existed but rendered invisible until `projects` was
toggled closed and open again. (f) dockview re-evaluates each sash's enabled state only
during a layout pass (`updateSashEnablement`), never on `setConstraints` alone: the pass a
pinned mutation triggers marks the sashes next to min==max groups `dv-disabled`, and
releasing the pin afterwards left them stuck that way — dividers dead until an unrelated
relayout.

**Guardrail.** (a) Skip the width bookkeeping and the save while a group is maximized
(`dock-layout-lifecycle.ts:41`). (b) Re-apply the saved sub-minimum sidebar widths right
after `fromJSON` so the collapse survives (`dock-layout-loader.ts:130`). (c) Clear the
pending debounced save on unmount (`useDockLayout.ts:288-295`). (d) Promote wrapper roots
(flipping the serialized orientation) before patching the ratio
(`dock-layout-builders.ts:41`). (e) Skip the sidebar pin when it would leave no unpinned
group to absorb the change (`dock-layout-helpers.ts:215`), and after a hint-based reopen
restore the default proportions — a reopened sidebar is sized to its 1/6 share, and a
reopened center pane shrinks any sidebar that had grown past a third of the dock back to
1/6 (`dock-layout-loader.ts:322-350`) — since `addPanel` naively splits the reference
group 50/50. Groups hosting an editor pane (files and the editor share one tabbed group)
are exempt from both shrinks — they are center panes, not sidebars. (f) Releasing a pin
pokes a same-size `setSize` on the group (`dock-layout-helpers.ts:200`), which triggers a
relayout that re-runs the enablement check against the released constraints — chosen over
a forced `api.layout()` because a forced pass re-applies the splitview's stale cached
proportions and undoes the pinned resize. The regression tests drive the
**real** dockview library
and the **real** layout helpers rather than an approximation:
`dock-layout-no-remount.test.tsx`, `useSidebarHandleCycle.collapse.test.tsx`,
`dock-layout-default-ratio.test.tsx`, `dock-layout-reopen-empty.test.tsx`,
`dock-layout-sash-enablement.test.tsx` (inspects the real sash DOM for stuck
`dv-disabled` classes), and `dock-layout-drag-restore.test.tsx` — the last
wires `element.offsetWidth` to dockview's tracked group width because jsdom has no layout
engine (`:30-36`). More in [Renderer](renderer.md).

## 5. Verify against the real code path, not an approximation

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
- **Test template** — `src/renderer/test-utils/strict-mode.test.tsx` is the copyable
  guardrail for trap #1; copy it next to a component and swap in the real one.
