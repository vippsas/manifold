# Gap Analysis: Manifold Search vs VS Code Search

Written: 2026-03-22

Scope: This report compares the findings in `docs/research/research-vscode-search.md` and `docs/research/research-manifold-search.md`, with one goal: identify the most important gaps and turn them into a practical improvement strategy for Manifold.

## Executive summary

VS Code search is broad, mature, and heavily optimized for code navigation inside a workspace. Manifold search is narrower and much earlier, but it also has a different opportunity surface: Manifold can search not just files, but also agent memory, sessions, branches, and parallel worktrees.

The core gap is not just "VS Code has more features." The real gap is that VS Code has a coherent search model for developers, while Manifold currently has two separate search experiences:

- a lightweight file-content search
- a separate memory search

The most important improvements for Manifold are not "copy everything VS Code does." The best path is:

1. make file search trustworthy and editor-like
2. unify the mental model of code search and memory search
3. make scope explicit, especially across worktrees and additional roots
4. add the few high-value interaction details users expect
5. then build Manifold-specific search features that VS Code does not have

If Manifold executes that sequence well, it can become better than VS Code for multi-agent project search, even if it never matches VS Code feature-for-feature.

## 1. The gap at a glance

| Area | VS Code | Manifold today | Gap | What Manifold should do |
| --- | --- | --- | --- | --- |
| Search surfaces | Multiple strong surfaces: local find, global search, quick open, symbol search, quick search, search editor | File search, memory search, filename filter | Manifold lacks a coherent search model | Standardize around local find, global code search, memory search, then add persistence |
| Shortcut model | Familiar and conventional | `Cmd/Ctrl+F` triggers global file search | Muscle memory mismatch | Restore local find on `Cmd/Ctrl+F`; move global search to `Cmd/Ctrl+Shift+F` |
| Query controls | Regex, case, whole-word, include/exclude, open-editors-only | No visible controls; backend behavior is implicit | Low trust and poor precision | Surface the key controls explicitly |
| Search scope | Workspace-oriented but clearly modeled | Current worktree only for code search; additional dirs not searched | Scope mismatch | Add explicit scope selection and search all visible roots when appropriate |
| Result navigation | Good preview, line navigation, replace preview, persistent search editor | Opens file but not the matching line; no persistent results | Results are less actionable | Add line navigation, preview, and persistent results |
| Engine | Ripgrep plus query model and providers | `git grep` for files; SQLite FTS5 for memory | File search is too limited | Move file search to a richer search service, ideally ripgrep-backed |
| AI use | Additive and explicit | No AI in file search; AI-generated content in memory search | Good foundation, but disconnected | Keep lexical search primary; add AI only as a visible enhancement |
| Product upside | Best-in-class workspace search | Unique multi-agent and memory context | Manifold can surpass VS Code in project knowledge search | Build cross-worktree and code-plus-memory search deliberately |

## 2. The most important differences

### 2.1 VS Code has a search system; Manifold has search features

VS Code's search story is broad but internally consistent:

- local find for the current editor
- global search for the workspace
- quick search surfaces for transient lookups
- persistent search results in a Search Editor
- file and symbol navigation through quick access

Manifold does not yet have that layered model. It has:

- a `Search` tab inside the `Files` panel
- a separate `Memory` panel with its own search box and filters
- a filename filter in the file tree

That means Manifold users currently have to infer the product's search model instead of learning a clear one.

### 2.2 VS Code is explicit about search semantics; Manifold is implicit

VS Code exposes the choices that materially affect search results:

- regex
- case sensitivity
- whole-word matching
- includes and excludes
- result presentation

Manifold file search currently inherits semantics from `git grep` but does not explain them in the UI. This is one of the largest trust gaps. A user sees `Search in files...` and reasonably assumes:

- literal text matching
- all visible files are searched
- clicking a hit will open the right file and line

Today those assumptions are only partly true.

### 2.3 VS Code search is workspace-centric; Manifold should be worktree-centric

VS Code's main search abstraction is the workspace. Manifold's product abstraction is different:

- project
- agent
- worktree
- branch
- session
- memory

This matters because the right goal for Manifold is not "build a smaller VS Code search." The right goal is "build the best search for a multi-agent, multi-worktree coding environment."

That changes the design target:

- searching across all open agent worktrees is more important than symbol search on day one
- showing branch or agent ownership in results is more important than copying every VS Code toggle immediately
- blending code hits with memory hits is a strategic advantage that VS Code does not naturally have

## 3. Where Manifold is behind VS Code

### 3.1 Core code search UX

This is the biggest functional gap.

VS Code gives users:

- standard shortcut separation
- search-on-type
- regex, case, whole-word
- include/exclude scope control
- better result previews
- line-accurate navigation
- replace workflows
- persistent search results

Manifold currently gives users:

- enter-to-search
- grouped file results
- match highlighting
- collapsible file groups

That is useful, but it is still a lightweight utility rather than a full search workflow.

### 3.2 Scope control and user trust

VS Code has confusion around ignores and excludes, but at least those concepts are surfaced and configurable.

Manifold has a more serious scope problem:

- file search appears broader than it really is
- additional directories are visible in the tree but not searched
- untracked-file behavior is likely narrower than users expect

This is more damaging than simply lacking advanced options, because it makes users less confident that "no results" actually means no results.

### 3.3 Result actionability

VS Code results are designed to move users directly into action. Manifold's results are weaker at the moment.

File search:

- should open the matching file and line
- should show more surrounding context
- should support keyboard-driven traversal

Memory search:

- should link back to sessions, files, branches, and possibly diffs
- should show why a result matched
- should feel like navigation, not just reading

### 3.4 Persistence and repeated search workflows

VS Code's Search Editor is a meaningful capability because users often need more than one active search. The sidebar alone is not enough.

Manifold has no equivalent yet. This matters because Manifold users are often doing:

- cross-agent comparison
- investigation across multiple outputs
- iterative search while reviewing generated changes

A persistent search artifact is arguably even more useful in Manifold than in VS Code.

### 3.5 Search surface breadth

VS Code has more ways to search:

- file names
- content
- symbols
- quick access
- persistent editors

Manifold does not need all of these immediately, but it does need to fill the obvious gaps:

- proper local find
- stronger global code search
- persistent result views

Symbol search and advanced quick-pick surfaces can wait until the foundation is solid.

## 4. Where Manifold is already different in a good way

This is the most important part of the analysis. Manifold should improve by learning from VS Code, but it should not become a clone.

### 4.1 Memory search is already a differentiated asset

VS Code's AI search is additive and still secondary. Manifold already has something more structurally interesting:

- searchable observations
- searchable session summaries
- searchable raw interactions
- concept filters
- chronological timeline

That means Manifold can evolve toward project knowledge search, not just code search.

### 4.2 Cross-worktree search is a natural Manifold feature

VS Code is built around one workspace. Manifold is built around many parallel worktrees attached to one project.

This creates a search feature that VS Code does not naturally own:

- search current agent worktree
- search all open agent worktrees
- search project root
- search imported/additional directories
- search memory

If Manifold makes this scope model clear and fast, it becomes a product advantage rather than a missing feature.

### 4.3 Search results can carry agent context

Manifold can enrich results with metadata that matters in a multi-agent workflow:

- agent name
- runtime
- branch
- worktree
- session
- file status

VS Code search is not designed around that problem. Manifold should be.

## 5. Recommended product direction for Manifold

### Principle 1: Do not copy all of VS Code's surfaces

VS Code's breadth is powerful, but it also makes search fragmented and less discoverable.

Manifold should aim for fewer, stronger search surfaces:

1. Local Find
2. Global Code Search
3. Memory Search
4. Persistent Search Results
5. Optional unified "Everything" search later

That is enough to create a coherent system without importing all of VS Code's complexity.

### Principle 2: Make search deterministic before making it intelligent

Users trust search when scope and semantics are predictable.

For Manifold, that means:

- lexical search first
- explicit scope first
- explicit match controls first
- line-accurate navigation first

Only after that should semantic or AI-assisted ranking become important.

### Principle 3: Lean into Manifold's own data model

The right abstraction for Manifold search is not just files. It is:

- code
- files
- branches
- worktrees
- sessions
- memory

Search should eventually make these objects first-class rather than treating everything like plain text in a folder.

## 6. Recommended roadmap

### Phase 1: Fix the trust and usability gaps

This is the highest-value short-term work.

1. Restore standard shortcuts.
   Use `Cmd/Ctrl+F` for local editor find and `Cmd/Ctrl+Shift+F` for global code search.

2. Open file hits at the exact matching line.
   This is table stakes.

3. Make search scope explicit.
   At minimum:
   - current worktree
   - all visible roots
   - all open agent worktrees

4. Surface core query controls.
   At minimum:
   - case-sensitive
   - regex or literal mode
   - whole-word

5. Clarify result scope in the UI.
   If Manifold is only searching tracked files or only one worktree, say so.

6. Add search-on-type with debounce for code search.
   Enter-only search is slower and feels inconsistent next to memory search.

### Phase 2: Upgrade code search into a proper workflow

1. Replace the current `git grep` backend with a richer search service.
   Ripgrep is the obvious candidate because it supports:
   - multi-root directory search
   - untracked files
   - include/exclude globs
   - better control over literal vs regex matching

2. Add result snippets with surrounding context.
   This is already identified in `docs/research/research-features.md`.

3. Add keyboard navigation and preview behavior.
   Users should be able to move through results quickly without treating the mouse as mandatory.

4. Add persistent search results.
   The most natural Manifold version is a search-results document or search-results editor tab.

5. Add include/exclude scope controls.
   Keep them progressive, not noisy. A collapsed "Search details" model similar to VS Code is reasonable.

### Phase 3: Unify code search and memory search

1. Create a shared query model.
   Even if code search and memory search use different engines, they should share:
   - query state
   - filters
   - scope chips
   - keyboard conventions
   - result interaction patterns

2. Add a unified top-level Search panel.
   Good candidate tabs:
   - Code
   - Memory
   - Everything

3. Add richer actions to memory results.
   Good next actions:
   - open session
   - open related file
   - jump to branch or worktree
   - filter by runtime

4. Explain why a memory result matched.
   Snippet-level or field-level match explanations would make memory search much more trustworthy.

### Phase 4: Build Manifold-native search features

This is where Manifold can move beyond VS Code rather than merely catching up.

1. Cross-worktree search by default.
   Search results should group naturally by:
   - worktree
   - branch
   - agent

2. Hybrid code-and-memory search.
   A query like `auth token refresh` should be able to return:
   - matching files
   - relevant observations
   - session summaries
   - message excerpts

3. Search only changed files or changed code.
   This is especially useful in a multi-agent review workflow.

4. Optional semantic reranking for memory and notes.
   This should be additive, visible, and easy to disable.

## 7. What not to prioritize yet

These are lower-value compared with the current gaps:

- full VS Code parity on every search surface
- extension-style provider architecture
- notebook-style search
- AI-first code search
- vector search for all file content

Those may be reasonable later, but they are not where the current product gap is.

## 8. Likely implementation direction

This is not a code plan, but it does suggest the architectural shape.

### UI touchpoints

- `src/main/app/app-menu.ts`
- `src/renderer/hooks/useAppEffects.ts`
- `src/renderer/components/editor/SearchResults.tsx`
- `src/renderer/components/editor/dock-panels.tsx`
- `src/renderer/components/memory/MemoryPanelContent.tsx`
- `src/renderer/hooks/useMemory.ts`

### Backend touchpoints

- `src/main/ipc/file-handlers.ts`
- `src/main/ipc/memory-handlers.ts`
- `src/main/memory/memory-store.ts`

### Architectural recommendation

Manifold should introduce a shared search layer with:

- a common query object
- explicit scope definitions
- shared result metadata
- one file-search backend
- one memory-search backend
- a single result interaction model in the renderer

That would let Manifold grow search coherently instead of adding more one-off search components.

## 9. Bottom line

The gap between VS Code and Manifold is real, but it is not mainly about missing bells and whistles. The deeper gap is that VS Code search feels like a complete developer workflow, while Manifold search still feels like two promising but separate features.

The right response is:

- close the core code-search trust gap
- unify the user model of search
- keep lexical search primary
- make scope and navigation explicit
- then build the multi-agent and memory-aware features that only Manifold can offer

If Manifold does that, it does not need to beat VS Code at generic workspace search. It can beat VS Code at project intelligence across agents, worktrees, and memory.

## Sources

- `docs/research/research-vscode-search.md`
- `docs/research/research-manifold-search.md`
- `docs/research/research-features.md`
