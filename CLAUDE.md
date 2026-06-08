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

## 5. Documentation wiki (keep docs in sync with code)

Manifold keeps a **living reference layer** under [`docs/architecture/`](docs/architecture)
that tracks the code. The doc map is [`docs/README.md`](docs/README.md); the append-only
run record is [`log.md`](log.md); the rationale is [`docs/llm-wiki.md`](docs/llm-wiki.md).
This schema governs that layer.

- **`covers:` binding.** Every living page declares the code path(s) it documents in
  YAML frontmatter: `covers: [src/main/<area>]`, plus `description:`, `updated:` (ISO
  date), and `owner: see .github/CODEOWNERS`. The binding is what makes drift measurable.
- **Code is ground truth.** Verify every claim against *current code*, never against
  sibling docs. The pass that **checks** a page must be a different pass than the one
  that **wrote** it — a writer can't certify its own output. Cite `file:line`.
- **Staleness is measured from git.** A page is stale when commits hit its `covers:`
  path after its `updated:` date:
  `git rev-list --count $(git log -1 --format=%h -- <page>)..HEAD -- <covers>`.
- **When you change code, update its page(s) in the same PR** and bump `updated:`. A new
  `src/main/*` subsystem ⇒ a new page, added to the [`docs/README.md`](docs/README.md) map.
- **Lint** (record findings in [`log.md`](log.md)): stale pages (git gap), broken code
  refs (a named file/symbol that no longer exists), missing subsystem pages, orphans
  (page not in the doc map), and frozen-spec misuse.
- **Living vs. frozen.** `docs/superpowers/`, `docs/planning/`, and `docs/research/` are
  point-in-time specs — raw historical evidence. Never "freshen" them, and never cite a
  superseded spec as current truth. Only the living layer tracks the code.

`log.md` entries are newest-first, one `##` heading each, prefixed
`ingest | sync | lint | structure` (feed: `grep "^## \[" log.md | head`).

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
