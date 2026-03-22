# Manifold Search: Three Pillars Analysis

Written: 2026-03-22

Scope: This document focuses on the three search capabilities Manifold should be especially good at:

- unified search model
- AI search based on memory and all agents
- basic text match search

It is based on:

- `docs/research/research-vscode-search.md`
- `docs/research/research-manifold-search.md`
- `docs/research/research-gap-manifold-vs-vscode-search.md`

## Executive summary

These three goals are not three separate products. They are three layers of one search system.

The dependency order matters:

1. basic text match search must be reliable and trusted
2. unified search must make code search and memory search feel like one system
3. AI search should sit on top of those foundations, not replace them

Manifold's biggest current weakness is not only missing features. It is that search does not yet feel like one coherent workflow. The biggest current opportunity is that Manifold can search across code, branches, worktrees, sessions, and memory in a way VS Code cannot naturally do.

## 1. Unified search model

### What "good" looks like

From a user's perspective, Manifold should have one clear search mental model:

- local find for the active editor
- global search for project code across the right scope
- memory search for observations, summaries, and interactions
- later, an `Everything` search that combines code and memory

The user should not have to remember that:

- code search lives inside the `Files` panel
- memory search lives in a separate `Memory` panel
- the two behave differently
- one search requires `Enter` while the other is debounced
- result actions are different between code and memory

### What specifically needs to be done

### 1.1 Define one search surface model

Manifold should standardize around these top-level surfaces:

- `Local Find`
- `Code`
- `Memory`
- `Everything` later

That does not mean every surface must be visible at once. It means the product should use one vocabulary and one interaction model.

### 1.2 Fix shortcut semantics

The current shortcut model is backwards for most editor users.

Manifold should use:

- `Cmd/Ctrl+F` for in-file find in Monaco
- `Cmd/Ctrl+Shift+F` for global search

This is one of the highest-value UX fixes because it restores trust immediately.

### 1.3 Define a shared scope model

Search scope should become explicit and reusable across code and AI search.

Manifold should support these scope concepts:

- active worktree
- visible roots
- all open agent worktrees for the current project
- project memory

The user should always know what is being searched. "No results" is only useful if scope is clear.

### 1.4 Define a shared query model

Code search and memory search should not each have their own ad hoc request shape. They should share:

- query text
- search mode
- scope
- case sensitivity
- literal vs regex
- whole-word
- include/exclude patterns where applicable
- result limit
- AI options where applicable

### 1.5 Define a shared result model

Results from code search and memory search should be renderable in one list component, even if they come from different engines.

Every result should carry enough metadata to support navigation and filtering:

- result type
- title
- snippet
- score or rank
- file path and line if applicable
- session id
- branch
- worktree
- runtime
- timestamp

### 1.6 Unify result interactions

Whether a hit comes from code or memory, the user should get the same core affordances:

- keyboard navigation
- preview/open behavior
- direct jump to source
- filter refinement
- clear indication of why the result matched

### 1.7 Separate search from memory timeline

The current `Memory` panel mixes search and timeline. That is useful, but it makes search feel like a memory-only feature.

The cleaner model is:

- dedicated `Search` panel for `Code`, `Memory`, and later `Everything`
- `Memory` panel stays valuable as timeline/history/inspection

That would make search a first-class workflow instead of a panel-local feature.

### Definition of done for the unified model

The unified model is in place when:

- search shortcuts are conventional
- code and memory use the same search shell
- search scope is explicit
- results share one interaction model
- users can understand "what is being searched" without reading the code

## 2. AI search based on memory and all agents

### What "good" looks like

AI search in Manifold should not mean "replace search with chat." It should mean:

- search across all relevant project knowledge, not just the active worktree
- use AI to rerank, summarize, or answer
- always ground results in real files, sessions, and observations

The strongest Manifold-specific capability is not generic semantic search. It is grounded project intelligence across:

- all open agent worktrees
- session summaries
- observations
- raw interactions

### What specifically needs to be done

### 2.1 Build one unified search corpus

AI search cannot be trustworthy unless the retrieval set is complete enough.

Manifold needs a unified corpus that includes:

- code search hits from all selected worktrees
- observations
- session summaries
- interactions

This should be project-scoped, not session-scoped.

### 2.2 Preserve provenance for every item

Every AI-visible item needs metadata so the answer can cite it later.

At minimum:

- project id
- session id
- branch
- worktree path
- runtime
- file path
- line number or line range for code hits
- timestamp for memory hits

Without provenance, AI search becomes untrustworthy very quickly.

### 2.3 Use retrieval first, AI second

The retrieval pipeline should be:

1. lexical code search
2. lexical memory search
3. merge and dedupe
4. optional AI reranking
5. optional AI answer synthesis

That order keeps exact search deterministic and lets AI improve ranking and comprehension without hiding the sources.

### 2.4 Add an `Everything` or `Ask Project` mode

The first AI-facing UX should likely be one of these:

- `Everything` search with mixed code and memory results
- `Ask Project` with grounded citations to files and memory entries

The user should be able to ask for concepts, not just raw text, while still seeing where the answer came from.

### 2.5 Make memory results actionable first

AI search will feel shallow if memory results remain read-only cards.

Memory results need direct actions such as:

- open related session
- open touched file
- jump to branch/worktree
- filter to this runtime or agent

### 2.6 Add source explanation to AI output

If Manifold produces an AI answer, it should show:

- which sources were used
- whether those sources are code, observations, summaries, or interactions
- links back to the exact source

This matters more than having the most sophisticated model.

### 2.7 Keep AI clearly additive

Users should be able to:

- run exact lexical search without AI
- run lexical search with AI reranking
- ask an AI question over the retrieved results

Those should be separate modes, not one opaque search path.

### Definition of done for AI search

AI search is ready when:

- it searches across all chosen worktrees and memory
- every answer is grounded and cited
- results remain explainable
- turning AI off still leaves a good exact-search workflow

## 3. Basic text match search

### What "good" looks like

Basic text search is the foundation of everything else. It must be:

- fast
- explicit
- line-accurate
- scope-aware
- keyboard-friendly

Today Manifold's file search is useful but too narrow and too implicit. That is acceptable for a prototype, but not for a search workflow users should trust.

### What specifically needs to be done

### 3.1 Replace or wrap the current backend

The current `git grep` approach is too limited for Manifold's needs. It is tied to the active worktree and inherits Git semantics the UI does not explain.

Manifold should move to a richer code-search service, ideally ripgrep-based, because it needs:

- multi-root search
- untracked-file support
- explicit literal vs regex behavior
- include/exclude support
- better snippet/context support

### 3.2 Make scope match the UI

If the UI shows additional roots or multiple worktrees, the search system must either:

- search them
- or say clearly that it is not searching them

This is the single biggest trust issue in the current code-search UX.

### 3.3 Add the expected search controls

At minimum, basic code search needs:

- case-sensitive toggle
- literal or regex mode
- whole-word toggle
- result limit
- optional include/exclude globs

These can be progressive and collapsed, but they need to exist.

### 3.4 Open the exact file and line

Clicking a result should not only open the file. It should jump to the matching line and ideally the column.

This requires extending the file-open flow so search can pass line and column metadata all the way into Monaco.

### 3.5 Add context snippets

Single-line result display is not enough once search spans multiple worktrees or larger files.

Each result should show:

- the matching line
- optional surrounding context
- highlighted match text

### 3.6 Make code search responsive

Code search should behave more like memory search:

- debounced query updates
- cancellation of stale searches
- clear searching state
- clear no-results state

### 3.7 Add keyboard navigation

Basic search does not feel complete until users can:

- move through hits with the keyboard
- expand/collapse groups
- open in place
- open in another pane later if needed

### Definition of done for basic text search

Basic text search is ready when:

- it supports explicit matching options
- it searches the chosen scope correctly
- it opens exact file locations
- it shows useful snippets
- users can trust that results and no-results are meaningful

## 4. Priority order across the three pillars

The right implementation order is:

1. make basic text search reliable
2. standardize the unified search model
3. add AI retrieval, reranking, and answer synthesis on top

The wrong order would be:

1. build AI search first
2. leave code search implicit and scope-confusing
3. hope AI makes the product feel coherent

That would create a system that sounds more advanced than it feels.

## 5. Bottom line

To be good at search, Manifold does not need to copy all of VS Code. It needs to do three things very well:

- make exact code search trustworthy
- make code search and memory search feel like one product
- use AI to synthesize across all worktrees and memory without hiding the underlying sources

That is a more focused goal than "full VS Code parity," and it matches Manifold's real advantage much better.
