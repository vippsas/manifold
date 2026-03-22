# Manifold Search Analysis

Written: 2026-03-22

Scope: This report focuses on Manifold's user-facing search surfaces in the repo at `/Users/svenmalvik/.manifold/worktrees/manifold/manifold-search`, plus the small amount of public feedback currently visible around the project. When I say "search" below, I mainly mean Manifold's file-content search and memory search, with a brief note on adjacent filters.

## Executive summary

Manifold does not have one unified search system. From a user's perspective, it currently has two main search experiences:

- file-content search in the `Files` panel
- memory search in the optional `Memory` panel

There is also a lighter-weight filename filter in the file tree, but that is a filter, not full content search.

The file-content search is intentionally simple. It is a panel-local UI that uses `git grep` under the hood. That makes it fast and implementation-light, but it also makes it narrower than the UI suggests: it searches the current worktree, likely only tracked files by default, and exposes none of the usual search controls users expect from editors such as case, regex, whole-word, replace, include/exclude globs, or jump-to-match-line behavior.

The memory search is more ambitious. It lets users search across compressed observations, session summaries, and raw interactions, with type and concept filters. It is implemented with SQLite FTS5, not vector search. AI is involved indirectly by generating some of the searchable memory content, but the actual search engine is still keyword/full-text search, not embeddings or semantic retrieval.

The overall UX is promising but early. The strengths are simplicity, speed, and the idea of searching both code/files and accumulated project memory inside one tool. The weaknesses are discoverability, scope mismatches, and a lack of the small interaction details that make search feel precise and trustworthy.

## 1. What a user can search for

### Primary search surfaces

| Surface | How a user opens it | What it searches | Best mental model |
| --- | --- | --- | --- |
| File-content search | `Cmd/Ctrl+F` or the `Search` tab inside `Files` | Text across files in the current agent worktree | Simple "find in files" |
| Memory search | `View -> Toggle Memory` / `Cmd/Ctrl+7`, then `Search` in the Memory panel | Stored observations, session summaries, and raw interaction text | Search the project's accumulated history/knowledge |
| File tree filter | Top of the `Files` tab | File and folder names only | Quick filename filter |

### More specifically, users can search for

#### File-content search

- Plain text typed into `Search in files...`
- Patterns interpreted by `git grep`, which means basic POSIX regex semantics by default, not guaranteed literal substring matching
- Matches in text files under the current worktree
- Up to 50 matches per file

Important practical limitations:

- it searches only the active session's main worktree path
- it does not currently search Manifold's `additionalDirs`, even though those directories can be shown in the file tree
- because it uses `git grep` without `--untracked` or `--no-index`, it likely misses untracked files
- it excludes binary files with `-I`

Relevant code:

- `src/renderer/components/editor/SearchResults.tsx:37-118`
- `src/main/ipc/file-handlers.ts:167-190`
- `src/main/ipc/file-handlers.ts:203-223`

#### Memory search

- Observation titles, summaries, and facts
- Session summary fields such as task description, what was done, and what was learned
- Raw interaction text from user/agent/system messages
- Filtered subsets by observation type
- Filtered subsets by concept tags such as `how-it-works`, `what-changed`, and `problem-solution`

Memory result types are explicitly modeled as:

- `observation`
- `session_summary`
- `interaction`

Relevant code:

- `src/shared/memory-types.ts:81-166`
- `src/renderer/components/memory/MemoryPanelContent.tsx:172-299`
- `src/main/ipc/memory-handlers.ts:82-138`
- `src/main/memory/memory-store.ts:244-330`

#### Adjacent search/filter surfaces

- The file tree has a `Filter files...` box for case-insensitive filename filtering:
  - `src/renderer/components/editor/FileTree.tsx:172-186`
  - `src/renderer/components/editor/file-tree-helpers.tsx:70-85`
- Settings/theme picking also supports name search, but that is a separate UI concern rather than part of the main project/code search story:
  - `README.md:97`

## 2. Where search lives in the UI

### File-content search

From a user's perspective, Manifold's main file search is not a top-level search view like VS Code's Search sidebar. It lives inside the `Files` panel as a second tab beside `Files`.

Default layout placement:

- the `Files` panel is created below `Repositories`
- `Modified Files` shares the same panel group
- the `Files` panel is active by default

Relevant code:

- `src/renderer/hooks/dock-layout-builders.ts:9-44`
- `src/renderer/hooks/dock-layout-helpers.ts:7-28`
- `src/renderer/components/editor/dock-panels.tsx:154-209`

The user-facing path is:

1. open the `Files` panel
2. switch from `Files` to `Search`
3. enter a query
4. press `Enter`

There is also a menu shortcut:

- `Cmd/Ctrl+F` is wired to `Find in Files`
- it sends `view:show-search`
- the renderer ensures the `Files` panel is visible and activates it

Relevant code:

- `src/main/app/app-menu.ts:29-44`
- `src/renderer/hooks/useAppEffects.ts:38-48`

### Memory search

Memory search lives in a separate `Memory` panel, not in the default layout. The panel exists as a dockable panel and can be toggled from the View menu with `Cmd/Ctrl+7`.

Relevant code:

- `src/main/app/app-menu.ts:79-83`
- `src/renderer/hooks/dock-layout-helpers.ts:7-28`
- `src/renderer/components/memory/MemoryPanel.tsx:7-19`

Inside the Memory panel, the user sees:

- a search bar at the top
- `Search` and `Timeline` tabs
- type filter chips
- concept filter chips
- a stats bar

Relevant code:

- `src/renderer/components/memory/MemoryPanelContent.tsx:114-299`

## 3. How search works from a user's perspective

### File-content search UX

If the user presses `Cmd/Ctrl+F`, Manifold opens or focuses the `Files` panel and switches it to the `Search` tab. The user types into `Search in files...`, presses `Enter`, and gets grouped results by file. Each file group can be collapsed. Matching text is highlighted, and each result shows a line number.

That sounds close to a standard editor search UX, but there are some important differences in the actual experience:

- search does not run as you type
- there are no visible controls for case sensitivity, regex, or whole-word matching
- clicking a match opens the file, but does not navigate to the specific matching line
- the empty state says `Search for text across all files`, but the implementation is narrower than that claim

Relevant code:

- `src/renderer/components/editor/SearchResults.tsx:45-58`
- `src/renderer/components/editor/SearchResults.tsx:69-117`

From a user's standpoint, this is best described as a lightweight file-search utility rather than a fully featured search workbench.

### File tree filter UX

The filename filter is separate from content search. It sits at the top of the `Files` tab, filters immediately as the user types, and matches names case-insensitively. `Escape` clears it.

That makes it useful for quick navigation, but users need to understand that it only filters the tree; it does not search file contents.

Relevant code:

- `src/renderer/components/editor/FileTree.tsx:66-78`
- `src/renderer/components/editor/FileTree.tsx:172-185`
- `src/renderer/components/editor/file-tree-helpers.tsx:70-85`

### Memory search UX

Memory search behaves differently from file search:

- typing into `Search memory...` triggers a debounced search after about 300 ms
- a non-empty query automatically switches the panel to the `Search` tab
- results can be narrowed by type and concept filters
- the `Timeline` tab gives a chronological view of the same memory system

Relevant code:

- `src/renderer/components/memory/MemoryPanelContent.tsx:172-225`
- `src/renderer/hooks/useMemory.ts:53-87`

This is the stronger UX conceptually. It gives users a way to search not just files, but what Manifold has learned about the project. The panel also exposes memory as something inspectable and manageable instead of a hidden AI feature.

The main UX weakness is actionability. Search results are good for reading, but they are not strongly connected back to the underlying artifact:

- no direct "open source file" action from a memory result
- no "go to session" affordance in the search card itself
- no highlighted match fragments showing exactly why a result matched

### Shortcut expectations

One important UX caveat: Manifold currently binds `Cmd/Ctrl+F` at the app menu level to `Find in Files`.

I did not find a separate current app-level implementation for editor-local find. A March 2026 search commit mentions enabling Monaco `Cmd+F`, but the current menu code no longer exposes a `find` role, and I did not verify the live behavior interactively. So the safe conclusion is:

- global `Cmd/Ctrl+F` definitely triggers file search
- editor-local find is not clearly surfaced in the current implementation

Relevant code and history:

- `src/main/app/app-menu.ts:39-42`
- `git log`: commit `67924fe` (`feat: add in-file search, filename filter, and full-text search`)

From a user's perspective, that is a likely friction point because most editor users expect:

- `Cmd/Ctrl+F` = find in current file
- `Cmd/Ctrl+Shift+F` = find in files

Manifold currently collapses that distinction.

## 4. How search is implemented

### File-content search implementation

The file-search flow is:

1. the menu sends `view:show-search`
2. the renderer opens/focuses the `fileTree` panel
3. the `FileTreePanel` switches to its `search` tab
4. the `SearchResults` component calls IPC `files:search-content`
5. the main process runs `git grep`
6. output is parsed and returned as grouped file results

Relevant code path:

- `src/main/app/app-menu.ts:39-42`
- `src/renderer/hooks/useAppEffects.ts:38-48`
- `src/renderer/components/editor/dock-panels.tsx:162-207`
- `src/renderer/components/editor/SearchResults.tsx:45-58`
- `src/main/ipc/file-handlers.ts:167-190`

The exact command is:

```bash
git grep -n -I --heading --break --max-count=50 -- <query>
```

Implementation consequences:

- `git grep` is fast and simple
- default matching semantics come from Git grep, not from a custom search engine
- search is scoped to `session.worktreePath`
- results are parsed into absolute file paths with line numbers
- queries time out after 10 seconds and have a 1 MB output buffer

Relevant code:

- `src/main/ipc/file-handlers.ts:173-181`
- `src/main/ipc/file-handlers.ts:203-223`

This is materially simpler than VS Code's ripgrep-based search stack. It is a pragmatic implementation, but it inherits Git grep's limits and exposes very little of its configurability.

### Memory search implementation

The memory-search flow is:

1. the Memory panel updates `searchQuery`
2. `useMemory` debounces for 300 ms
3. the renderer invokes `memory:search`
4. the main process queries the `MemoryStore`
5. the store runs SQLite FTS5 queries over observations and session summaries
6. the handler also searches raw interactions through `interactions_fts`
7. results are merged, ranked, and returned

Relevant code:

- `src/renderer/hooks/useMemory.ts:53-87`
- `src/main/ipc/memory-handlers.ts:82-138`
- `src/main/memory/memory-store.ts:244-330`

The memory database schema uses:

- `interactions`
- `observations`
- `session_summaries`
- matching FTS5 virtual tables for each

Tokenizer:

- `porter unicode61`

Relevant code:

- `src/main/memory/memory-store.ts:17-120`

Practical behavior:

- FTS ranks results and sorts by rank
- observation results can be filtered by type and concept
- raw interaction search is included only when no type filter is applied
- if an FTS query fails on special characters, the handler falls back to compressed results only

Relevant code:

- `src/main/ipc/memory-handlers.ts:93-137`
- `src/main/memory/memory-store.ts:310-330`

Tests confirm the intended model:

- interactions are searchable by text content
- observations are searchable via FTS5
- combined search returns both observation and summary results

Relevant tests:

- `src/main/memory/memory-store.test.ts:100-112`
- `src/main/memory/memory-store.test.ts:138-166`
- `src/main/memory/memory-store.test.ts:196-225`

## 5. Is AI used for search?

Short answer:

- file-content search: no
- memory search engine: no
- memory indexing/content generation: yes, indirectly

### File-content search

No AI is used. It is plain `git grep`.

Relevant code:

- `src/main/ipc/file-handlers.ts:167-181`

### Memory search

The search engine is also not AI-native. It is SQLite FTS5 keyword/full-text search.

Relevant code:

- `src/main/memory/memory-store.ts:40-45`
- `src/main/memory/memory-store.ts:69-76`
- `src/main/memory/memory-store.ts:102-109`

However, AI is involved one layer upstream. Manifold can use an installed AI runtime to compress sessions into:

- observations
- session summaries
- concept tags
- narratives and facts

Those AI-generated artifacts are then stored and searched with FTS5.

Relevant code:

- `src/main/memory/memory-compressor.ts:195-245`
- `src/main/memory/memory-compressor.ts:255-279`

If no AI runtime is available, Manifold falls back to regex/heuristic extraction instead.

Relevant code:

- `src/main/memory/memory-compressor.ts:207-213`
- `src/main/memory/memory-compressor.ts:25-50`

There is also a retrieval path where matching observations are pulled into `AGENTS.md` / `CLAUDE.md`-style context files for future agent sessions:

- `src/main/memory/memory-injector.ts:57-107`

So the precise answer is:

- Manifold does not currently use AI as the search engine
- Manifold does use AI to generate part of the searchable memory corpus
- there is no evidence of embeddings, vector databases, or true semantic search in the current implementation

## 6. UX assessment from a user's perspective

### What works well

- The main file search is easy to understand. Users see `Files` and `Search` side by side rather than having to learn a complex search workbench.
- The filename filter is immediate and useful for quick navigation.
- The memory search concept is genuinely differentiated. Searching observations, summaries, and message history is more interesting than just searching files.
- Type and concept filters give memory search a stronger mental model than a plain keyword box.
- The memory timeline plus stats bar make the system legible. Users can see that memory exists, what it contains, and how much of it there is.

### What is weak or confusing

- `Cmd/Ctrl+F` maps to global file search, which cuts against strong editor muscle memory.
- File search semantics are under-explained. A user will assume "text search across files", but the actual behavior depends on Git grep defaults.
- Search scope is narrower than the UI suggests. Visible additional directories are not searched.
- Clicking a file-search result does not take the user to the matching line, which is a meaningful UX miss.
- File search has no replace, no include/exclude control, no case toggle, no regex toggle, and no explicit "search as regex" warning.
- File search requires `Enter`, while memory search is debounced. The inconsistency is not necessarily wrong, but it makes the product feel less unified.
- Memory search is readable but not very navigable. Results do not strongly link back to files, sessions, or branches.
- Memory search likely behaves awkwardly on special-character queries because of FTS syntax and fallback handling.

### Overall UX verdict

From a user's perspective, Manifold search currently feels like:

- a useful lightweight file search
- a much more novel but still early memory search

The idea is strong. The interaction details are not yet at the level where users will feel total confidence in scope, precision, and navigation.

## 7. What are users saying about search?

### Public feedback is currently very sparse

I did not find a meaningful body of public search-specific discussion around Manifold. The project appears to still be early in its public lifecycle.

Public signal I could verify:

- the public GitHub repo currently shows `1` star, `0` issues, and `2` pull requests

Source:

- public repository metadata observed during the research pass

That does not mean users dislike search. It means there is not enough public evidence yet to make a strong claim either way.

### The clearest feedback signal is internal rather than public

The repo itself contains a strong product-direction note in `docs/research/research-features.md`:

- the current `SearchResults` component is considered basic
- it should be upgraded with semantic snippets
- it should support searching across all open agent worktrees simultaneously

Relevant reference:

- `docs/research/research-features.md:61-63`

This is the most concrete signal about what informed users currently think needs improvement.

### Inference

My inference is:

- early users/developers probably find search useful enough to keep extending
- they probably do not see it as finished
- the current search is better described as "promising and practical" than "loved and mature"

That is an inference from the codebase, local history, and the lack of broad public discussion, not a direct quote from a user survey.

## 8. What should be improved

### Highest-impact improvements

1. Separate local find from global file search. The editor-standard model is `Cmd/Ctrl+F` for in-file find and `Cmd/Ctrl+Shift+F` for file-content search.

2. Make file-search scope match the UI.
   If the file tree shows additional directories or multiple workspace roots, search should include them, or the UI should clearly say it only searches the main worktree.

3. Open file results at the matching line.
   This is a basic expectation and would dramatically improve trust in the search interaction.

4. Add explicit search controls or clarify semantics. At minimum, users need case-sensitive control, regex control or explicit regex labeling, whole-word control, and tracked/untracked scope.

5. Add result context.
   The internal research doc is right here: surrounding context snippets would make file search much easier to scan.

### Important next improvements

6. Search across all open agent worktrees.
   This is particularly aligned with Manifold's core product identity. Searching only one worktree at a time underuses the multi-agent model.

7. Improve memory result actionability. Good next actions would be opening the related session, opening files touched, copying the summary, and filtering by runtime or branch.

8. Show why a memory result matched.
   Snippet highlighting or matched-field metadata would reduce the "black box" feel.

9. Make memory search more robust to literal/special-character queries.
   FTS syntax sensitivity is easy for users to trip over.

10. Consider semantic retrieval for memory as an additive feature.
   Not as a replacement for FTS5, but as a second mode for "conceptual" search across observations and notes.

### Strategic recommendation

If Manifold wants search to become a differentiator rather than just a utility, the strongest path is:

1. make file search reliable and editor-like
2. make cross-worktree search first-class
3. make memory search navigable and explainable
4. add semantic retrieval only after the basics feel trustworthy

That sequence matches the product's actual strengths better than jumping straight to "AI search".

## Conclusion

From the user's perspective, Manifold search is currently two different products:

- a simple code/file search UI built on `git grep`
- a more novel memory search UI built on SQLite FTS5 over project history

The file search is pragmatic but narrow. The memory search is more differentiated but still early. AI is present in the memory pipeline, but not as the core search engine. Public feedback is still too sparse to claim strong approval or dissatisfaction, but the repo's own planning documents clearly point toward the next step: broader scope, better context, better navigation, and eventually more semantic behavior.

## Sources

### Local repo references

- `src/main/app/app-menu.ts`
- `src/renderer/hooks/useAppEffects.ts`
- `src/renderer/hooks/dock-layout-builders.ts`
- `src/renderer/hooks/dock-layout-helpers.ts`
- `src/renderer/components/editor/dock-panels.tsx`
- `src/renderer/components/editor/SearchResults.tsx`
- `src/main/ipc/file-handlers.ts`
- `src/renderer/components/editor/FileTree.tsx`
- `src/renderer/components/editor/file-tree-helpers.tsx`
- `src/renderer/components/memory/MemoryPanel.tsx`
- `src/renderer/components/memory/MemoryPanelContent.tsx`
- `src/renderer/hooks/useMemory.ts`
- `src/shared/memory-types.ts`
- `src/main/ipc/memory-handlers.ts`
- `src/main/memory/memory-store.ts`
- `src/main/memory/memory-store.test.ts`
- `src/main/memory/memory-compressor.ts`
- `src/main/memory/memory-injector.ts`
- `docs/research/research-features.md`

### External/public references

- public repository metadata observed during the research pass
