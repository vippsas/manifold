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
`npm install`, asserts the Electron binary actually downloaded, and rebuilds `better-sqlite3`
for Electron's ABI, leaving the tree ready for both `npm run dev` and `npm test`. Do **not**
symlink `node_modules` from another clone: the symlink leaves an incomplete install (missing
`node_modules/electron/path.txt` → `Error: Electron uninstall`) and breaks some vitest `?url`
imports; a real install is the supported setup.

Run **`npm run doctor`** to check a worktree's health — it reports whether dependencies are
installed, the Electron binary is present, which ABI `better-sqlite3` is currently built for,
and whether `out/` is stale. It exits non-zero when the tree is not runnable.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
