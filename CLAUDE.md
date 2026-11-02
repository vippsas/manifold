# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**For renderer/theme changes, "done" includes seeing it.** Don't ask the user to find bugs
you can find yourself: capture the component (`npm run screenshot:component <Component> --theme
<id>`) or drive the real flow in the built app (`npm run drive:app`) and confirm it renders,
before claiming done — then the user only confirms taste. See
[renderer verification](docs/architecture/renderer-verification.md).

## 5. Documentation wiki (keep docs in sync with code)

`docs/architecture/` is a living reference layer that tracks the code — each page binds to a
`covers:` code path in its frontmatter. **Full schema & rationale:**
[`docs/llm-wiki.md`](docs/llm-wiki.md). **Doc map, lint, and the self-firing routine:**
[`docs/README.md`](docs/README.md).

**Known traps come first.** Before debugging a symptom that smells like StrictMode
double-mount, a `better-sqlite3` ABI mismatch, an unrunnable worktree, or dockview layout
restore/width-0, read [`docs/architecture/gotchas.md`](docs/architecture/gotchas.md) — the
cross-cutting index of the recurring traps, each paired with the checked-in
test/script/doc that pins it. It saves you from rediscovering a known root cause.

In-loop rules:
- **Change code ⇒ update its covering page(s) in the same PR**, bumping `updated:`. A new
  `src/main/*` subsystem ⇒ a new page, added to the [doc map](docs/README.md).
- **Code is ground truth.** Verify every doc claim against current code and cite `file:line`;
  a pass other than the writer certifies it — a writer can't certify its own output.
- **Never freshen frozen specs** (`docs/superpowers|planning|research`) or cite one as
  current; only `docs/architecture/` tracks the code.
- Check drift with `bash scripts/wiki-lint.sh` (a daily routine runs it and PRs stale pages).

## 6. Checked-in skills

`.claude/skills/` is the source of truth for repository-maintained skills. After changing any
checked-in skill or its helper scripts, refresh Codex's installed copies from the repo root:

```bash
npm run sync:codex-skills
```

The sync copies every first-level skill under `.claude/skills/` into `~/.codex/skills/` and applies
Codex-specific rewrites for skills that need them.

## 7. Worktree setup

A fresh worktree has no `node_modules`. **Run `npm run bootstrap`** — it does a real
`npm install`, fetches the Electron binary (`install-electron`; Electron 42 no longer downloads it on install) and asserts it is there, and rebuilds `better-sqlite3`
for Electron's ABI, leaving the tree ready for both `npm run dev` and `npm test`. Do **not**
symlink `node_modules` from another clone: the symlink leaves an incomplete install (missing
`node_modules/electron/path.txt` → `Error: Electron uninstall`) and breaks some vitest `?url`
imports; a real install is the supported setup.

Run **`npm run doctor`** to check a worktree's health — it reports whether dependencies are
installed, the Electron binary is present, which ABI `better-sqlite3` is currently built for,
and whether `out/` is stale. It exits non-zero when the tree is not runnable.

## 8. Manifold server runs (issue → PR)

This repo is worked by a Manifold dispatcher (`manifold` label queue, `manifold/issue-*`
branches). During such a run, edit only the prepared checkout. The dispatcher owns branches,
commits, pushes, PR publication and GitHub labels. Do not start another issue processor (e.g.
`gh-process-issues`) or publication workflow, and do not use administrative credentials. Work
non-interactively.

- **Architecture entry points:** [`docs/README.md`](docs/README.md) (doc map) and
  [`docs/architecture/`](docs/architecture/) — `app.md`, `ipc.md`, `renderer.md`, `plugins.md`.
- **Prepare:** `npm ci` (lockfile-pinned; since Electron 42 it does not download the Electron binary — the gate doesn't need it, only running the app does: `npx install-electron`). `npm test`'s
  `pretest` rebuilds `better-sqlite3` for the host Node when its ABI does not match, which needs
  a C/C++ toolchain.
- **Offline gate** (the dispatcher's verify command; needs no network once prepared):
  `npm run typecheck && npm test` — web, node and plugin typechecks, then vitest. There is no
  general npm lint/format command, but CI also runs `shellcheck install-linux.sh`: when you
  change that script, run it too (or report it as unverified if `shellcheck` is missing). Never
  run two `npm test` at once (the sqlite rebuild clobbers the in-flight run).
- **macOS app, Linux runner:** Manifold ships as a macOS Electron app, but runs execute in a
  non-root Linux container. The offline gate is platform-neutral (CI runs it on Linux with
  Node 24; `node-pty` and `better-sqlite3` compile there, so the image needs Node 24, Python 3
  and a C/C++ toolchain). Anything macOS-only cannot be verified in the run: `npm run dist`
  (DMG, signing, notarization), darwin `node-pty` prebuilds, native macOS behaviour, and
  §4's "see it" step (`drive:app`, and `screenshot:component` when no Chromium is present).
  For renderer/theme changes, rely on unit tests and list the visual check as a live gap.
- Connected checks (CI's `npm run dist:linux` + package verification, CodeQL, live-app driving)
  are downstream; list them as unverified rather than claiming them.
- Follow the dispatcher's prompt protocol: finish with root `MANIFOLD_SUMMARY.md` (change
  description + a **Verification** section with commands/results and live-system gaps; not
  committed). Only if human input is indispensable *and* you made no useful changes, write
  root `MANIFOLD_QUESTION.md` and stop.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
