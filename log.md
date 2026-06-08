# Wiki run log

Append-only. **Newest first.** One `##` entry per operation, prefixed
`ingest | sync | lint | structure`. Quick feed: `grep "^## \[" log.md | head`.

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
