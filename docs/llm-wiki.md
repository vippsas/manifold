# LLM Wiki for Manifold — keeping documentation in sync with code

A pattern for operating Manifold's documentation as an LLM-maintained wiki: a living
reference layer that an agent keeps in sync with the code, instead of a pile of
point-in-time design docs that rot.

This file is self-contained. Hand it to your agent (Claude Code reads `CLAUDE.md`;
Codex reads `AGENTS.md` — in this repo they are the same file) and instantiate the
specifics together. Everything below refers only to files and tools that exist in the
repository.

## Starting point: Manifold isn't undocumented — it's documented in the wrong mode

The great majority of `docs/` is `superpowers/` specs, plans, and designs — point-in-time
artifacts that record what was built *once* and stop being true the moment the feature
ships. Against a few hundred source files, the *living, code-tracking reference layer* is
essentially the architecture section of `README.md` and `docs/plugins/authoring.md` — the
latter already a code-tracking page in spirit (it says "This document should match that
code", the `covers:` idea before it had a name). So what's missing is maintained
documentation **of the code itself**. That is what this wiki is for.

## The one change that matters: the source of truth is code, not documents

The usual "LLM wiki" assumes raw sources are immutable external documents, so the wiki
only drifts when *you add a source* and a periodic, human-triggered cleanup is enough.

A code repository breaks that assumption. The source of truth is `src/**`, and **it
changes continuously and independently of the docs**. A page goes stale not when you
touch it, but when the *code underneath it* changes. Three consequences follow, and they
define the whole pattern:

1. **The trigger flips** from "a human added a source" to "**code changed**" — which is
   detectable from `git`, not dependent on anyone remembering.
2. **Every page needs a `covers:` binding** to the code path it documents, so drift can
   be measured.
3. **Code is ground truth.** A page is verified against *current code*, never against
   sibling docs — and the pass that checks a page must be separate from the pass that
   wrote it, because a writer can't certify its own output.

## The three layers

- **Raw sources** (read-only truth): `src/**`, git history, merged PRs, and the frozen
  `docs/superpowers/**` specs and plans. The wiki reads these; it never edits the code or
  rewrites a historical spec.
- **The wiki** (LLM-maintained): a living reference layer keyed to the architecture.
  Near-empty today — bootstrapping it is the first job (below).
- **The schema** (the rules): `CLAUDE.md` / `AGENTS.md`, holding the conventions defined
  in this document. You co-evolve it as the workflow settles.

## Living docs vs. frozen specs — the distinction this repo most needs

This is the trap to avoid. The `docs/superpowers/specs|plans|designs` are point-in-time:
they capture a decision at a moment, and a 2026-06 plan *should* still read as it did in
2026-06. Keeping them "fresh" is meaningless.

So treat them as raw historical evidence — the wiki distills from them, then leaves them
frozen — and maintain the living reference layer **separately**. Never try to keep a spec
current, and never cite a superseded spec as if it were current truth. Specifications are
point-in-time by nature; living reference docs are what track the code.

## The schema (the actual rules)

**1. `covers:` frontmatter — the doc→code binding.** The essential field. Every living
page declares the code it documents:

```yaml
---
description: How agent sessions are started, stopped, resumed, and discovered on disk.
covers: [src/main/session]          # the code this page is the documentation for
updated: 2026-06-08
owner: see .github/CODEOWNERS        # who owns the covered code
---
```

**2. Staleness rule (measurable from git).** A page is stale when commits have hit its
`covers:` path since the page's `updated:` date:

```bash
doc_hash=$(git log -1 --format=%h -- docs/architecture/session.md)
git rev-list --count ${doc_hash}..HEAD -- src/main/session    # > threshold ⇒ stale
```

**3. Code is ground truth.** Verify every claim against current code. The reviewer of a
doc change is a different pass than the writer, with the code as the reference.

**4. Lint = code-doc drift.** The checks that matter in a code repository:
   - **Stale pages** — the git gap above crosses threshold.
   - **Broken code refs** — a page names a file, service, or symbol that no longer exists.
   - **Missing subsystem pages** — a `src/main/*` area with no page covering it.
   - **Orphans / index drift** — a page absent from the doc map.
   - **Frozen-spec misuse** — a living page citing a superseded spec as current.

**5. Index = a doc map** at `docs/README.md`: page → `covers:` path → one-line summary,
grouped by subsystem. The top-level `README.md` stays the **user-facing** front door; the
doc map is the **contributor/agent** entry point.

**6. `log.md`** — an append-only record at the repo root, newest first, one `##` heading
per entry prefixed `ingest | sync | lint | structure`, so
`grep "^## \[" log.md | head` gives a recent feed.

## Operations

- **Backfill + Sync.** *Backfill:* walk `src/**` and write the missing reference pages
  from the code. *Sync:* when a PR changes code, update the pages whose `covers:` matches —
  ideally in the same PR.
- **Query.** Ask questions against the wiki; the agent reads the relevant pages and
  answers with citations. File good answers back as pages so they compound.
- **Lint.** Run the git-gap drift scan plus the checks above; findings go to `log.md`.
  This is continuous and measurable, not a periodic guess.

## Bootstrapping the near-empty living layer (first move)

Because the living layer barely exists, step one is a backfill, not maintenance:

1. **Draw the page map from the architecture.** A page per main-process area under
   `src/main/*` (fourteen today: `session`, `git`/worktrees, `workspace`, `agent` — the AI
   runtimes and PTY pool — `background-agent-host`, `watch`, `memory`, `search`,
   `provisioning`, `plugins`, `store`, `fs`, `app`, `ipc`), plus a handful of cross-cutting
   pages: the preload bridge (`src/preload`), the plugin API (promote
   `docs/plugins/authoring.md`), the renderer structure (`src/renderer`), the on-disk data
   model (`~/.manifold/**`, sketched in `README.md`'s "Local Data" table), and
   build/release.
2. **One backfill pass per subsystem** — the agent reads the code, writes the page with a
   `covers:` binding, verified against the code.
3. **Add `docs/README.md` (doc map) and `log.md`.**
4. **Put the schema into `CLAUDE.md` / `AGENTS.md`.**

Start with the highest-traffic subsystem (`src/main/session` + worktrees): the biggest,
most visible win, and it gives you one finished page to use as the template for the rest.

## Then make it self-firing

The cleanup can run itself here, which a prose-only wiki can't easily manage: the
staleness signal comes from `git` (so it needs no human to notice), and Manifold is itself
an agent runner — the Loop plugin (`resources/plugins/manifold.loop`) and the
`background-agent/` machinery already exist. So the lint can run as a scheduled agent that
scans `covers:` gaps, opens one doc-sync PR per stale page, and leaves a human to review.
The signal fires the work; the human only approves.

## Principles

The human curates sources, asks the questions, and decides what matters; the agent does
the bookkeeping — writing pages, fixing cross-references, updating the index, logging.
Git is the substrate: version history, PR review, and revert come for free. And the schema
is alive — conventions that survive a few sync cycles get promoted into
`CLAUDE.md` / `AGENTS.md`; the rest are dropped.
