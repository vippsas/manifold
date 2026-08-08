# Sidebar Active-Workspace Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark the workspace whose agent is open in the main panel with an accent rail down the whole card plus a subtle wash on the workspace's own rows, so it is findable at a glance.

**Architecture:** CSS only, entirely in `src/renderer/styles/theme.css`. No component changes — `WorkspaceCard.tsx:118` already puts `sidebar-project-group--active` on the card, and `WorkspaceList.tsx:116` already derives that from `activeWorkspaceId`. The card becomes the highlight surface (it takes the 8px horizontal margin its rows currently carry), a `::before` draws the rail, and a child-combinator selector washes only direct `.sidebar-item-row` children — which excludes an expanded file tree for free.

**Tech Stack:** Plain CSS custom properties (`--accent`, `--sidebar-active-bg`, `--sidebar-active-border`, `--bg-sidebar`, `--radius-sm`), all already defined. Verification via `scripts/screenshot-component.mjs` (esbuild + playwright-core headless Chromium under a real Manifold theme) and vitest.

**Design spec:** `docs/superpowers/specs/2026-08-08-sidebar-active-workspace-highlight-design.md`

## Global Constraints

- **All CSS edits go in `src/renderer/styles/theme.css`.** No new stylesheet, no inline styles, no component file changes.
- **Never add `overflow: hidden` to the active card.** It would break the sticky header that lives inside it (`theme.css:920`).
- **Never change row `padding`.** The 8px horizontal margin moves from rows to the card; padding stays, so no label shifts horizontally.
- **Consume existing tokens only.** Do not edit `--sidebar-active-bg`, `--sidebar-active-border`, or their mapping in `src/shared/themes/adapter.ts`.
- **Source order matters more than usual here.** Several selectors in this plan tie on specificity at `(0,3,0)`; where a rule is placed in the file decides which wins. Each task states its insertion point exactly. Do not reorder them.
- **Out of scope:** `.file-tree-row--active` (`theme.css:1777`), the file tree generally, and the working-agent status dots (`theme.css:466`, `core-pulse` at `:477`).

---

## Prerequisite: a runnable worktree

This worktree has no `node_modules`. Per CLAUDE.md §7, run a real install — do **not** symlink `node_modules` from another clone.

```bash
npm run bootstrap
npm run doctor   # must exit 0 before starting Task 1
```

`npm run bootstrap` does an `npm install`, asserts the Electron binary downloaded, and rebuilds `better-sqlite3` for Electron's ABI. It takes several minutes. If it dies in `node-gyp` with `.deps/...sqlite3.o.d.raw: No such file`, pre-create the `.deps` tree at the **package root** (not `build/`) and re-run with `make -C build -j1`.

---

### Task 1: The card becomes a highlighted region

**Files:**
- Modify: `src/renderer/styles/theme.css` (insert a new block between `:913` and the comment at `:915`)
- Verify against: `src/renderer/components/sidebar/ProjectSidebar.fixture.tsx` (no changes needed — it already sets `activeWorkspaceId={workspace.id}` and seeds `project:frontend` open in `localStorage`, so the active card renders **with an expanded file tree**, which is exactly the state that proves the wash boundary)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the selector `.sidebar-workspace-card.sidebar-project-group--active` as a positioned, margined surface, and a `> .sidebar-item-row` rule at specificity `(0,3,0)`. Task 2 depends on both — specifically on this block sitting *earlier in the file* than the sticky rule it modifies.

- [ ] **Step 1: Capture the baseline, before changing anything**

```bash
mkdir -p /tmp/manifold-shots
npm run screenshot:component ProjectSidebar --theme royal-dark --out /tmp/manifold-shots/before.png
```

Open `/tmp/manifold-shots/before.png` and confirm you can see: the "Checkout redesign" card at the top with its folders expanded beneath it, and two other workspace cards below. Note where the row labels sit horizontally — you will compare against this in Step 5.

- [ ] **Step 2: Read the insertion point**

Open `src/renderer/styles/theme.css` and find this rule (around line 910):

```css
.sidebar-project-row {
  font-weight: 400;
  padding-right: 56px;
}
```

The new block goes immediately **after** this rule and immediately **before** the comment beginning `/* The workspace you are in is the first row in the list...`.

This placement is load-bearing. The sticky rule inside that comment's block has the same specificity `(0,3,0)` as the wash rule you are about to add, so whichever comes last wins for the header row. The sticky rule must win, so your new block must come first.

- [ ] **Step 3: Insert the treatment**

```css
/* The workspace you are in reads as a region, not a row: a 2px accent rail down
   the card's whole height — past an expanded tree — with a subtle wash on the
   workspace's own rows. Neither half works alone. The rail by itself competes
   with the pulsing status dots on every working workspace below it (`core-pulse`,
   :477) and a static 2px line loses to motion; the wash by itself does not tie
   the header to the folders under it. */
.sidebar-workspace-card.sidebar-project-group--active {
  position: relative;
  margin: 2px 8px;
  border-radius: var(--radius-sm);
}

/* Deliberately no `overflow: hidden` — it would kill the sticky header inside
   this card. The rail rounds its own left corners instead. */
.sidebar-workspace-card.sidebar-project-group--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  background: var(--accent);
}

/* The card now owns the 8px its rows used to carry (:871), so the wash meets the
   rail with no gap. Padding is untouched, so no label moves. The child
   combinator is what scopes the wash: it lands on the workspace header, its repo
   rows and any drafts, while an expanded tree renders into
   `.sidebar-project-files` (`WorkspaceRepoRow.tsx:117`) — not a row, so it stays
   on the plain sidebar surface and the highlight costs the same at any depth. */
.sidebar-workspace-card.sidebar-project-group--active > .sidebar-item-row {
  margin-inline: 0;
  background: var(--sidebar-active-bg);
}

/* `--list-hover-bg` is accent at 5% against this 7% wash, and loses on
   specificity besides (:881 is `(0,2,0)`) — without this rule, rows in the
   active card would not respond to hover at all. `--sidebar-active-border` is
   accent at 12%: an unambiguous step up, and already in the palette. */
.sidebar-workspace-card.sidebar-project-group--active > .sidebar-item-row:hover {
  background: var(--sidebar-active-border);
}
```

- [ ] **Step 4: Capture the result**

```bash
npm run screenshot:component ProjectSidebar --theme royal-dark --out /tmp/manifold-shots/after-task1.png
```

- [ ] **Step 5: Verify the four things this task must get right**

Open `/tmp/manifold-shots/after-task1.png` beside `before.png` and confirm all four:

1. **The rail is there** — a 2px gold line down the left edge of the "Checkout redesign" card, running the card's full height including past the expanded file tree.
2. **The wash stops above the tree** — the workspace row and its two folder rows are tinted; the file rows (`guides`, `checkout.md`, `README.md`) sit on the plain sidebar background.
3. **No label shifted horizontally.** Compare the x-position of the workspace name against `before.png`. If text moved sideways, you changed padding somewhere — revert and re-read Step 3.
4. **The other two cards are untouched.**

Expected known gap, which Task 2 fixes and you should NOT fix here: nothing yet distinguishes the header row's own background when it sticks, and hover on the sticky header is not yet correct.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/styles/theme.css
git commit -m "feat(sidebar): mark the active workspace with an accent rail and wash"
```

---

### Task 2: The sticky header and its hover

**Files:**
- Modify: `src/renderer/styles/theme.css:915-925` (the existing sticky-header rule) and append one new rule directly after it

**Interfaces:**
- Consumes: from Task 1, the rule `.sidebar-workspace-card.sidebar-project-group--active > .sidebar-item-row` — which sets a **translucent** background at `(0,3,0)` and sits earlier in the file.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Understand the two bugs before touching anything**

Both come from Task 1's wash meeting the existing sticky rule.

*Bug one — the header punches a hole in its own highlight.* The header row is both a `.sidebar-item-row` and a `.sidebar-project-row`. Task 1's wash rule and the sticky rule below both score `(0,3,0)`, and the sticky rule comes later, so its **opaque** `background: var(--bg-sidebar)` wins. The header renders un-washed while its own children stay washed.

*Bug two — hovering the header goes see-through.* Task 1's hover rule scores `(0,3,1)` and beats the sticky rule's `(0,3,0)`. Hovering the header replaces its opaque background with a 12% translucent one, so rows scrolling beneath read straight through it — the exact failure the sticky rule's comment was written to prevent.

Both are fixed the same way: composite the wash **onto** the opaque base rather than replacing it.

- [ ] **Step 2: Replace the sticky rule**

Find this block (around line 915):

```css
/* The workspace you are in is the first row in the list, and it stays put while
   its own folders and files scroll under it — so scrolling deep into a tree
   never costs you the label saying where you are. It needs its own background:
   a row is transparent until hovered, and the rows passing beneath would
   otherwise read straight through this one. */
.sidebar-workspace-card.sidebar-project-group--active > .sidebar-project-row {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--bg-sidebar);
}
```

Replace it with:

```css
/* The workspace you are in is the first row in the list, and it stays put while
   its own folders and files scroll under it — so scrolling deep into a tree
   never costs you the label saying where you are. It needs its own background:
   a row is transparent until hovered, and the rows passing beneath would
   otherwise read straight through this one.
   That background has to be the card's wash *composited onto* an opaque base,
   not a flat `--bg-sidebar`: this rule ties with the card's own wash rule at
   `(0,3,0)` and comes later, so a flat fill would win and leave the header
   reading unhighlighted while its children stayed washed. */
.sidebar-workspace-card.sidebar-project-group--active > .sidebar-project-row {
  position: sticky;
  top: 0;
  z-index: 2;
  background:
    linear-gradient(var(--sidebar-active-bg), var(--sidebar-active-bg)),
    var(--bg-sidebar);
}

/* Same trick for hover, and it is not optional: the card's hover rule scores
   `(0,3,1)` and would otherwise beat the sticky rule above, swapping this row's
   opaque base for a translucent 12% fill and letting the rows scrolling under it
   show through. */
.sidebar-workspace-card.sidebar-project-group--active > .sidebar-project-row:hover {
  background:
    linear-gradient(var(--sidebar-active-border), var(--sidebar-active-border)),
    var(--bg-sidebar);
}
```

- [ ] **Step 3: Verify the resting state**

```bash
npm run screenshot:component ProjectSidebar --theme royal-dark --out /tmp/manifold-shots/after-task2.png
```

Open it and confirm the workspace header row is now washed to the **same** tint as its folder rows below — one continuous block, no lighter or darker band across the top row. Compare directly against `after-task1.png`, where the header was the odd one out.

- [ ] **Step 4: Verify the sticky and hover states, which a static screenshot cannot show**

The screenshot script can emit the bundled page as HTML so you can drive it by hand:

```bash
npm run screenshot:component ProjectSidebar --theme royal-dark --emit-html /tmp/manifold-shots/sidebar.html
open /tmp/manifold-shots/sidebar.html
```

In the browser, confirm three things:

1. **Hover the workspace header** — it brightens (12% vs 7%), and rows below it do **not** show through.
2. **Hover a folder row inside the active card** — it brightens too. This is the regression Task 1's hover rule prevents.
3. **Scroll the list until the header sticks** — it stays opaque and keeps its wash; nothing reads through it.

If the emitted HTML does not scroll (the fixture is 720px tall), temporarily shrink the wrapper height in devtools rather than editing the fixture.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/theme.css
git commit -m "fix(sidebar): composite the active card's wash into its sticky header"
```

---

### Task 3: Documentation and the full gate

**Files:**
- Modify: `docs/architecture/renderer.md` (add a section; bump `updated:` in the frontmatter)

**Interfaces:**
- Consumes: the finished CSS from Tasks 1 and 2.
- Produces: nothing.

- [ ] **Step 1: Add the section to the renderer doc**

`docs/architecture/renderer.md` has `covers: [src/renderer]`, so CLAUDE.md §5 requires it to change in this same PR. Add this after the "**Workspace rows name their repo**" section:

```markdown
**The active workspace is marked as a region, not a row.** The card carrying
`sidebar-project-group--active` (`WorkspaceCard.tsx:118`) gets a 2px accent rail
down its full height plus a wash of `--sidebar-active-bg` on its rows
(`theme.css:915`). The split is deliberate: the rail runs past an expanded file
tree so the region still reads as one, while the wash lands only on direct
`.sidebar-item-row` children — an expanded tree renders into
`.sidebar-project-files` (`WorkspaceRepoRow.tsx:117`), which is not a row, so the
highlight costs the same whether a folder is collapsed or a large tree is open.
Two traps sit in these selectors. The sticky header (`theme.css:936`) needs the
wash **composited onto** `--bg-sidebar` via a `linear-gradient` layer rather than
a flat fill — it ties with the card's wash rule at `(0,3,0)` and comes later, so
a flat opaque fill wins and leaves the header reading unhighlighted. And rows in
the active card need their own `:hover`: `--list-hover-bg` is accent at 5%
against the 7% wash and loses on specificity anyway (`theme.css:881` is
`(0,2,0)`), so without it the active card stops responding to the pointer.
```

Check the two `theme.css:NNN` line numbers against the file as it now stands and correct them — code is ground truth.

- [ ] **Step 2: Bump the frontmatter date**

In `docs/architecture/renderer.md`, set `updated: 2026-08-08`.

- [ ] **Step 3: Run the doc lint**

```bash
bash scripts/wiki-lint.sh
```

Expected: no new staleness reported for `renderer.md`.

- [ ] **Step 4: Run the sidebar tests**

```bash
npx vitest run src/renderer/components/sidebar
```

Expected: PASS. These are jsdom tests that assert class names and behaviour, not computed styles — `theme.css` is never loaded, so they cannot see this change. They are here to prove nothing *else* broke.

- [ ] **Step 5: Run the full gate**

```bash
npm test
npm run typecheck
```

Expected: both exit 0. `npm run typecheck` chains web, node, and plugins.

Two known-local failures that are **not** yours: four editor suites failing with `Denied ID ... pdf.worker?url` only appear when `node_modules` is a symlink (it should not be here — you ran `npm run bootstrap`). If you see them, your install is wrong, not your CSS.

- [ ] **Step 6: Commit and open the PR**

```bash
git add docs/architecture/renderer.md
git commit -m "docs(renderer): describe the active-workspace rail and wash"
git push -u origin HEAD
gh pr create --title "Highlight the active workspace in the sidebar" --body "..."
```

Write the PR body from the design spec's *Goal* and *Decision* sections, and attach `before.png` and `after-task2.png`.

---

## Self-Review

**Spec coverage.** Each of the design's six implementation rules maps to a step: rules 1–3 (card surface, margin move, rail) and rule 4 (wash) are Task 1 Step 3; rule 5 (sticky composite) and rule 6 (hover) are Task 2 Step 2 — Task 1 also carries the non-sticky half of rule 6, since the two hover rules must sit in different places in the file. The spec's verification section is Task 1 Steps 1/4/5, Task 2 Steps 3/4, and Task 3 Steps 4/5. Its documentation section is Task 3 Steps 1–3. Its "no unit test" decision is stated in Task 3 Step 4.

**Placeholders.** The only `...` is the `gh pr create --body`, which Step 6 immediately says how to fill. No TBDs, no "handle edge cases", no "similar to Task N".

**Consistency.** Every selector is spelled `.sidebar-workspace-card.sidebar-project-group--active` throughout. Specificity is quoted as `(0,3,0)` / `(0,3,1)` / `(0,2,0)` consistently in the plan, the doc text, and the CSS comments. Token names match `adapter.ts`: `--sidebar-active-bg`, `--sidebar-active-border`, `--bg-sidebar`, `--accent`, `--radius-sm`, `--list-hover-bg`.

**One gap found and fixed while reviewing.** The design spec treats the hover fix as a single rule. It cannot be: the generic row hover must sit *before* the sticky rule and the header's hover *after* it, or the header goes translucent on hover. The plan splits it across Tasks 1 and 2 and says why in both places.
