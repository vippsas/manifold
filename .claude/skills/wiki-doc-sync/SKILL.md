---
name: wiki-doc-sync
description: Detect documentation pages whose covered code has drifted and open one doc-sync PR per stale page. Use when running the documentation wiki's self-firing lint (scheduled or on demand), or when asked to sync the architecture docs with the code.
---

# Wiki doc-sync

The self-firing half of Manifold's documentation wiki (see `docs/llm-wiki.md`). The
staleness signal is git-measurable, so this needs no human to *notice* drift — it turns
each stale page into one reviewable PR. **The signal fires the work; a human only approves.**

## Procedure

1. **Lint.** From the repo root, run:

   ```bash
   bash scripts/wiki-lint.sh
   ```

   - If `structural checks: FAILED`, fix those first — a broken `covers:` ref, a missing
     subsystem page, an orphan, or frozen-spec misuse is a correctness bug in the wiki
     itself. Handle it in its own PR.
   - Collect every `STALE …` line. Each names a page and the `covers:` paths that moved.

2. **Nothing stale ⇒ stop.** No PRs, no noise.

3. **README is review-only.** If `README.md` is flagged, do **not** auto-edit it — it is
   the editorial, user-facing front door. Note it for a human ("README flagged: check
   whether a runtime, npm script, or `~/.manifold/**` path actually changed"). Never
   fabricate front-door copy changes just to clear the flag.

4. **For each stale `docs/architecture/*.md` page — one page, one PR:**
   1. Branch: `docs/sync-<page-basename>` (e.g. `docs/sync-session`).
   2. Read the page, then read its `covers:` code **as it is now**. Code is ground truth.
   3. Apply **surgical** corrections only: wrong `file:line` citations, renamed/removed
      symbols, changed behavior, broken cross-references. Do not rewrite wholesale or
      change tone/structure. Match the page's style; `docs/architecture/session.md` is the
      template.
   4. Bump the page's `updated:` to today's date.
   5. Prepend a `## [sync] <date> — synced <page> with code` entry to `log.md`
      (newest first) summarizing what drifted.
   6. **Verify (writer ≠ verifier):** re-run `bash scripts/wiki-lint.sh` and confirm that
      page no longer reports `STALE` and `structural checks: PASS`. The lint certifies the
      fix — not your own say-so. Then run `git status --porcelain` and confirm **only** the
      doc page and `log.md` are modified: reading the `covers:` code is required, editing it
      is not. Revert any stray change to a tracked file under `covers:` before committing — a
      dirtied `src/**` file left in a worktree is what blocks a later `ff-only` sync (#835).
   7. Commit (with a `Co-Authored-By` trailer) and open a PR titled
      `docs: sync <page> with code`, body summarizing the drift and the corrections.
      Request review from the covered code's owner (`.github/CODEOWNERS`).
      **Do not merge** — a human approves.

## Rules

- **One page → one PR.** Never bundle multiple pages into a single PR.
- **Never touch the code under `covers:`** — only the docs.
- **Never cite a frozen spec** (`docs/superpowers|planning|research`) as current truth.
- Keep deep internals in the wiki; the README only points to it.
- Conventions live in `CLAUDE.md` §5 / `AGENTS.md`. Promote anything that survives a few
  sync cycles; drop the rest.
