# Wiki run log

Append-only. **Newest first.** One `##` entry per operation, prefixed
`ingest | sync | lint | structure`. Quick feed: `grep "^## \[" log.md | head`.

## [structure] 2026-06-12 — Bootstrap the LLM GitHub-issue pipeline

Closed the loop from `docs/llm-github-issues.md` ("Bootstrapping") — the issue-tracker
sibling of the self-firing doc-sync agent. The human curates the queue by labeling an
issue; everything after the label is autonomous, and the conversation lives in the issue
thread, never a chat:

- Created the two labels that drive the state machine: `llm-github-issue` (the queue) and
  `feedback-needed` (blocked on a human answer in the thread).
- Added the `gh-process-issues` skill (`.claude/skills/gh-process-issues/SKILL.md`):
  sweeps the queue, classifies each issue against a `gh`-measurable state machine
  (Queued / Blocked / Delivered / Done), and for each Queued issue runs
  understand → reproduce → spec → plan → implement → verify, delivering **one PR per
  issue** (`Fixes #n`) with the reproduction and tests as evidence. Reuses the `testing`,
  `verify`, and `gh-create-pr` skills. No synchronous questions: a blocking ambiguity
  becomes a comment + the `feedback-needed` label, not a prompt. The agent never merges,
  closes, or edits an issue body — the human merges.
- Scheduled a **daily** Claude routine to fire `/gh-process-issues`. The label fires the
  work; the human only answers and approves. Effective once this branch lands on `main`
  (the skill ships with it); the routine no-ops until then.

GitHub is the per-run log (comment, label event, PR) — unlike the wiki, no `log.md` entry
per sweep; this entry records the one-time bootstrap only.

## [structure] 2026-06-08 — Trim the CLAUDE.md schema to in-loop essentials

`CLAUDE.md`/`AGENTS.md` is loaded into every agent's context every session, so §5 now keeps
only the rules an agent acts on mid-task (same-PR updates, code-as-ground-truth + writer ≠
verifier, don't freshen frozen specs, run the lint) and points to [`docs/llm-wiki.md`](docs/llm-wiki.md)
for the full schema and [`docs/README.md`](docs/README.md) for the doc map, lint, and routine.
No rules dropped — the depth already lives in those two docs.

## [structure] 2026-06-08 — Wire up the self-firing doc-sync agent

Closed the loop from `docs/llm-wiki.md` ("Then make it self-firing"):

- Added the `wiki-doc-sync` skill (`.claude/skills/wiki-doc-sync/SKILL.md`): runs `scripts/wiki-lint.sh`, and for each `STALE` architecture page re-verifies it against current code, applies surgical fixes, bumps `updated:`, and opens **one doc-sync PR per page**. The README is review-only (editorial — never auto-edited). The lint certifies the fix (writer ≠ verifier); a human approves the PR.
- Scheduled a **daily** Claude routine to fire `/wiki-doc-sync`. The git staleness signal fires the work; the human only approves. Effective once this branch lands on `main` (the skill + lint script ship with it); the routine no-ops until then.

## [structure] 2026-06-08 — Track the root README.md and add a lint script

Brought the user-facing `README.md` under the same drift discipline as the architecture
pages, and made the lint runnable:

- Trimmed the README's duplicated "Important main-process services" list down to a link to the [doc map](docs/README.md) — the wiki is now the single source of truth for that detail. Kept the high-level `src/*` layer map and the localhost-preview security note.
- Bound the README to the code its user-facing tables track, via an HTML comment (frontmatter renders badly on the GitHub landing page): `<!-- wiki-covers: src/main/agent/runtimes.ts, package.json, src/shared/defaults.ts -->` — the runtime registry, npm scripts, and storage defaults.
- Added `scripts/wiki-lint.sh` — runs the five checks over both frontmatter- and HTML-comment-bound pages. First run: **20 tracked pages**, structural checks **PASS** (README flagged stale pre-commit, as expected; resolves once this change lands).
- Added the user-facing sync rule to the `CLAUDE.md` schema: a PR changing a runtime, an npm script, or the `~/.manifold/**` layout updates `README.md` in the same PR; stale = review, not always edit.

## [lint] 2026-06-08 — First lint of the architecture wiki: clean

Ran the five schema checks over the freshly backfilled layer:

- **Broken code refs** — all `covers:` paths resolve on disk (14 × `src/main/*`, plus `src/plugin-host`, `src/preload`, `src/shared/plugins`, `src/shared/defaults.ts`, `src/renderer`, `package.json`). ✅
- **Missing subsystem pages** — 14/14 `src/main/*` subsystems have a covering page. ✅
- **Orphans / index drift** — all 19 pages are listed in `docs/README.md`. ✅
- **Frozen-spec misuse** — no living page cites a `docs/superpowers|planning|research` spec as current. ✅
- **Staleness (git gap)** — pages are new in this branch; covered code and docs land in the same PR, so the post-commit gap is 0 for every page. Threshold proposal: flag a page once >0 commits touch its `covers:` path after `updated:`.

Independent verifier pass (writer ≠ verifier, 6 reviewers over all 19 pages) confirmed
~700 `file:line` citations against current code and corrected: `store.md` (one swapped
citation), `provisioning.md` (`:180`→`:189`), `ipc.md` ("Each"→"Most" on test coverage),
`preload.md` (235-line count; channel whitelist counts 140 invoke / 1 send / 32 listen
re-verified). `plugins.md` `covers:` expanded to `[src/main/plugins, src/plugin-host]`
(the require-interceptor and capability gating live in the forked host) and stray
generation tags removed.

## [ingest] 2026-06-08 — Backfilled 19 architecture reference pages

First backfill of the living layer (it was near-empty: only the README architecture
section, `docs/external-provisioners.md`, and `docs/plugins/authoring.md`). One page per
main-process subsystem, written from the code with a `covers:` binding and verified
against it. `session.md` (highest-traffic subsystem) was written first as the template;
the other 18 were written to match it.

- **Main process (14):** session, git, workspace, agent, background-agent-host, watch, memory, search, provisioning, plugins, store, fs, app, ipc
- **Cross-cutting (3):** preload, plugin-api (concise code-bound companion to `plugins/authoring.md`), data-model (`~/.manifold/**` layout)
- **Renderer (1):** renderer
- **Build & release (1):** build

Code-grounded findings worth recording (the pages document reality, not the README's
summary): the background-agent host drives **Project Ideas only**, not the Loop plugin;
`MemoryInjector.injectContext()` is currently a deliberate no-op ("feature not ready
yet"); provisioning's builtin path is present-but-dormant scaffolding (`BUILTIN_PROVISIONERS`
is `{}`, no provisioner ships enabled); there is **no** standalone Search or Web-preview
dock panel (search is the title bar; preview is an editor iframe); `loop-logs/*.jsonl` is
written by the loop **plugin**, not `src/main`; and the real signed `.dmg` release runs in
`.github/workflows/release-dmg.yml` on the `v*` tag, not the local `dist` script.

## [structure] 2026-06-08 — Bootstrapped the LLM documentation wiki

Stood up the living reference layer described in `docs/llm-wiki.md`:

- Created `docs/architecture/` (the living layer) and `docs/README.md` (the doc map — the contributor/agent entry point; the top-level `README.md` stays user-facing).
- Created this `log.md`.
- Added the wiki **schema** (§5) to `CLAUDE.md` / `AGENTS.md`: `covers:` binding, git-gap staleness, code-as-ground-truth with writer ≠ verifier, the lint checks, and the living-vs-frozen-spec rule.

Next step (not done in this run): make the lint self-firing — a scheduled agent that
scans `covers:` gaps and opens one doc-sync PR per stale page, per `docs/llm-wiki.md`.
