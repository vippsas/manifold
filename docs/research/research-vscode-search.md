# VS Code Search Analysis

Written: 2026-03-22

Scope: This report focuses on VS Code's code/workspace search surfaces as implemented in the repo at `/Users/svenmalvik/git/vscode`, plus current official docs/release notes and a small set of public feedback sources. When I say "search" below, I mostly mean workspace/code search, not every search box in the product.

## Executive summary

VS Code does not have one single "search" feature. From a user's perspective, it has a family of related search surfaces:

- in-file find/replace
- Search view / Find in Files
- Quick Open / Go to File
- Go to Symbol in Workspace
- Quick Search
- Search Editor
- adjacent searches such as Settings search

The core search architecture is still classic developer tooling, not AI-first. Desktop workspace text/file search is built on ripgrep plus VS Code's own query building, result modeling, and UI. Web builds use a local file-search worker instead of ripgrep. On top of that, VS Code layers quick-pick-based file/symbol/text search, Search Editor, replace preview, notebook-aware search, and an extension/provider system.

The UX is strong for workspace-centric development: keyboard-first, fast, flexible, and highly configurable. The main weaknesses are also clear:

- advanced power features are split across several surfaces and are not very discoverable
- excludes/ignore files are the biggest source of confusion
- searching outside the current workspace is weaker than in tools like Notepad++ or dedicated grep/fzf workflows
- large-repo users often want a more persistent or split-view search workflow
- AI search exists, but it is additive and preview-oriented, not the core search engine

## 1. What a user can search for

### Primary search surfaces

| Surface | Default entry point | What it searches | Best mental model |
| --- | --- | --- | --- |
| In-file Find | `Cmd/Ctrl+F` | Current editor only | Local find/replace |
| Search view / Find in Files | `Cmd/Ctrl+Shift+F` | Text across workspace files | Main global text search |
| Quick Open / Go to File | `Cmd/Ctrl+P` | File names and paths, recent files, optional symbols | Fuzzy file navigator |
| Go to Symbol in Workspace | `Cmd/Ctrl+T` or `#` | Workspace symbols from language providers | Semantic symbol lookup |
| Quick Search | Command: `Search: Quick Search`, prefix `%` | Text across workspace files in quick-pick form | Fast transient text search |
| Search Editor | Commands such as `Open Search Editor` | Persistent text-search results in an editor tab | Saved/pinned search session |

### More specific things users can search

- Exact text or substring matches across files
- Regex matches
- Whole-word matches
- Case-sensitive or smart-case matches
- File names via fuzzy search
- Relative paths and, in some cases, absolute paths
- Workspace symbols via language providers
- Search restricted to include/exclude glob patterns
- Search restricted to open editors only
- Search in notebooks, including markdown/code/input/output filters in the Search view model
- Replace targets across files, with preview
- Semantic/AI results in the Search view when an AI provider is available and enabled

Important limitation: VS Code search is fundamentally workspace-oriented. If a folder is not opened as part of the current workspace/window, the default search UX is weaker. Public feedback repeatedly highlights this.

## 2. Where search lives in the UI

### Search view

By default, Search is a view container in the sidebar. In the repo, the Search view container is registered under `workbench.view.search` and attached to `ViewContainerLocation.Sidebar`, with `Cmd/Ctrl+Shift+F` as the main entry point.

Key code references:

- `src/vs/workbench/contrib/search/browser/search.contribution.ts:63-92`
- `src/vs/workbench/contrib/search/browser/searchActionsFind.ts:222-275`

From the official UI docs, Search is one of the standard views available from the Activity Bar / Primary Side Bar, and users can drag views to other locations such as the Panel or Secondary Side Bar:

- User Interface docs: https://code.visualstudio.com/docs/getstarted/userinterface
- Custom Layout docs: https://code.visualstudio.com/docs/configure/custom-layout

So from the user's perspective, Search is:

- in the Activity Bar by default
- opened in the Primary Side Bar by default
- movable to other layout locations

### Quick input surfaces

Several search experiences live in the unified quick input / quick access UI rather than the sidebar:

- Quick Open / Go to File: empty prefix
- Workspace symbols: `#`
- Quick Search: `%`

Key code references:

- `src/vs/workbench/contrib/search/browser/search.contribution.ts:94-129`
- `src/vs/workbench/contrib/search/browser/searchActionsSymbol.ts:15-33`
- `src/vs/workbench/contrib/search/browser/searchActionsTextQuickAccess.ts:18-35`

### Search Editor

Search Editor results live in a normal editor tab. This makes the search experience feel more document-like and persistent than the Search view.

Key code references:

- `src/vs/workbench/contrib/searchEditor/browser/searchEditor.contribution.ts:73-103`
- `src/vs/workbench/contrib/searchEditor/browser/searchEditor.contribution.ts:211-230`

## 3. How search works from a user's perspective

### Search view / Find in Files

This is the main global text-search UX.

User-facing behavior:

- Open with `Cmd/Ctrl+Shift+F`
- Type text and get grouped results by file
- Toggle regex, case-sensitive, whole-word
- Expand Search Details for include/exclude globs
- Optionally search only in open editors
- Replace across files with preview
- Change result sorting, list/tree layout, collapse behavior, and Search Editor behavior via settings

Official docs describe it exactly this way, including include/exclude boxes, Search Details, replace preview, and Search Editor:

- https://code.visualstudio.com/docs/editing/codebasics

Relevant repo implementation:

- Search Details toggle and include/exclude inputs:
  - `src/vs/workbench/contrib/search/browser/searchView.ts:475-536`
- Query construction from UI state:
  - `src/vs/workbench/contrib/search/browser/searchView.ts:1556-1668`
- Search-on-type:
  - `src/vs/workbench/contrib/search/browser/search.contribution.ts:295-314`
- Sorting/list/tree/Search Editor settings:
  - `src/vs/workbench/contrib/search/browser/search.contribution.ts:315-412`

UX characteristics:

- Search-on-type is on by default.
- Search Details are hidden behind an extra affordance, which keeps the default UI simple but hurts discoverability.
- Results are grouped and previewable, which is good for scanning.
- Replace preview is safer than raw blind replacement, especially in large refactors.
- The no-results state tries to guide the user toward settings/excludes or AI fallback:
  - `src/vs/workbench/contrib/search/browser/searchView.ts:1740-1806`

### Quick Open / Go to File

This is VS Code's file navigator and an important part of its "search" story.

Implementation notes:

- Registered as the default quick access provider with empty prefix:
  - `src/vs/workbench/contrib/search/browser/search.contribution.ts:97-107`
- It mixes:
  - recent file history
  - workspace file search
  - optional workspace symbols
- It deliberately merges fast and slow picks to reduce flicker:
  - `src/vs/workbench/contrib/search/browser/anythingQuickAccess.ts:414-446`
- File results come from the search service:
  - `src/vs/workbench/contrib/search/browser/anythingQuickAccess.ts:619-724`

From the user's perspective, Quick Open is:

- fast
- fuzzy
- heavily keyboard oriented
- good for "I know roughly what file/symbol I want"

It also supports power-user suffixes and related flows:

- append `:line` to jump to line
- append `@` for local symbol search inside the selected file
- optionally mix symbols into results through `search.quickOpen.includeSymbols`

### Workspace Symbol search

This is semantic rather than text-based. It depends on language providers.

- UI entry point: `Cmd/Ctrl+T` and `#`
- Code:
  - `src/vs/workbench/contrib/search/browser/searchActionsSymbol.ts:15-33`
  - `src/vs/workbench/contrib/search/browser/search.contribution.ts:109-115`

This is a strong UX distinction: users are not searching raw file contents here, they are searching symbol indexes.

### Quick Search

Quick Search is a less famous but very interesting UX surface:

- command-driven, quick-pick text search
- prefix `%`
- shows grouped content matches
- previews results transiently in editors
- can escalate into the full Search view with "See More Files" or the inline button

Implementation:

- prefix registration:
  - `src/vs/workbench/contrib/search/browser/search.contribution.ts:117-129`
- command:
  - `src/vs/workbench/contrib/search/browser/searchActionsTextQuickAccess.ts:18-35`
- provider:
  - `src/vs/workbench/contrib/search/browser/quickTextSearch/textSearchQuickAccess.ts:39-130`
  - `src/vs/workbench/contrib/search/browser/quickTextSearch/textSearchQuickAccess.ts:178-257`

UX verdict:

- good for quick transient codebase text lookup
- not as discoverable as Search view or Quick Open
- unusually elegant because it bridges quick input and full Search view

### Search Editor

Search Editor is the answer to "I want search results as a document, not only as a sidebar state."

Official docs position it as a full-sized editor with syntax highlighting and optional context lines:

- https://code.visualstudio.com/docs/editing/codebasics

Implementation:

- editor registration:
  - `src/vs/workbench/contrib/searchEditor/browser/searchEditor.contribution.ts:73-103`
- arguments for query, includes, excludes, context lines, flags:
  - `src/vs/workbench/contrib/searchEditor/browser/searchEditor.contribution.ts:211-230`

UX verdict:

- much better than the sidebar for large or persistent result sets
- especially useful when you want multiple searches over time
- still not identical to a dedicated "multiple active searches" UI

## 4. What settings and options matter most to users

The search system is unusually configurable. The most meaningful user-facing settings are:

- `search.mode`:
  - Search view vs reuse existing Search Editor vs open new Search Editor
  - `src/vs/workbench/contrib/search/browser/search.contribution.ts:164-174`
- `search.useIgnoreFiles`, `search.useGlobalIgnoreFiles`, `search.useParentIgnoreFiles`
  - controls `.gitignore` and related ignore files
  - `src/vs/workbench/contrib/search/browser/search.contribution.ts:187-203`
- `search.quickOpen.includeSymbols`, `search.quickOpen.includeHistory`
  - influence Quick Open results
  - `src/vs/workbench/contrib/search/browser/search.contribution.ts:205-229`
- `search.followSymlinks`
  - important for performance and result scope
  - `src/vs/workbench/contrib/search/browser/search.contribution.ts:230-233`
- `search.smartCase`
  - `src/vs/workbench/contrib/search/browser/search.contribution.ts:235-238`
- `search.maxResults`
  - `src/vs/workbench/contrib/search/browser/search.contribution.ts:253-256`
- `search.searchOnType`
  - `src/vs/workbench/contrib/search/browser/search.contribution.ts:295-314`
- `search.sortOrder`, `search.defaultViewMode`
  - `src/vs/workbench/contrib/search/browser/search.contribution.ts:351-384`

The key UX point is that VS Code search is not "simple search with a few toggles". It is a configurable search workbench.

## 5. How it is implemented

### 5.1 Query building

The Search view does not call ripgrep directly. It turns UI state into a structured query object first.

Important implementation details:

- SearchView reads text, regex/whole-word/case flags, notebook filters, include/exclude text, ignore toggles, and open-editors mode:
  - `src/vs/workbench/contrib/search/browser/searchView.ts:1578-1641`
- QueryBuilder converts that into `ITextQuery`, `IFileQuery`, or `IAITextQuery`:
  - `src/vs/workbench/services/search/common/queryBuilder.ts:132-161`
- QueryBuilder expands include/exclude patterns and can remap the query to only open editors:
  - `src/vs/workbench/services/search/common/queryBuilder.ts:233-330`

This is important because user-visible behavior like:

- include/exclude glob handling
- search paths
- open-editors-only search
- smart case
- notebook search scope

is mostly decided before the engine runs.

### 5.2 Search service orchestration

The central service is `SearchService`.

It:

- registers providers by scheme and type (`file`, `text`, `aiText`)
- merges synchronous open-editor results with async provider results
- activates extensions on search events
- fans out queries per URI scheme

Relevant code:

- provider maps and registration:
  - `src/vs/workbench/services/search/common/searchService.ts:28-80`
- text search merging open-editor sync results with provider async results:
  - `src/vs/workbench/services/search/common/searchService.ts:82-161`
- extension activation and provider execution:
  - `src/vs/workbench/services/search/common/searchService.ts:173-221`
  - `src/vs/workbench/services/search/common/searchService.ts:271-340`

This is a sophisticated design choice: open dirty/untitled editor results can appear immediately, while provider-backed disk results stream in after.

### 5.3 Desktop engine: ripgrep

On desktop/node, classic workspace search is ripgrep-based.

File search:

- ripgrep is spawned with `--files`
- include/exclude globs become `-g` arguments
- ignore-file behavior, symlink following, thread count, and global ignore behavior are translated into flags
- code:
  - `src/vs/workbench/services/search/node/ripgrepFileSearch.ts:20-90`

Text search:

- ripgrep is spawned against each folder query
- stdout is parsed incrementally
- results stream back while the process is still running
- cancellation kills the ripgrep process
- limit hits stop the search early
- code:
  - `src/vs/workbench/services/search/node/ripgrepTextSearchEngine.ts:24-154`

This means the core "Find in Files" engine is still classic grep tooling wrapped by a richer UI and query layer.

### 5.4 Web/browser engine

In browser/web environments, VS Code cannot rely on ripgrep in the same way, so it registers a `LocalFileSearchWorkerClient` backed by a web worker and File System Access handles.

Code:

- registration:
  - `src/vs/workbench/services/search/browser/searchService.ts:32-47`
- text search worker path:
  - `src/vs/workbench/services/search/browser/searchService.ts:88-143`
- file search worker path:
  - `src/vs/workbench/services/search/browser/searchService.ts:146-190`

So the search UX is similar across desktop and web, but the engine is not identical.

### 5.5 Extensibility and provider model

VS Code search is not hardcoded only for local files. It has provider APIs for:

- file search
- text search
- AI text search

Extension-host registration:

- `src/vs/workbench/api/common/extHostSearch.ts:21-114`
- provider execution for text/AI text:
  - `src/vs/workbench/api/common/extHostSearch.ts:170-216`

Main-thread wiring:

- `src/vs/workbench/api/browser/mainThreadSearch.ts:20-98`

This architecture matters because the product can support different schemes, remote resources, and future search providers without rewriting the main UI.

## 6. Is AI used for search?

### Short answer

Yes, but only as an optional overlay. AI is not the core search engine.

### More precise answer

Classic file/text search is still:

- file-name search through VS Code's file search providers
- text search through ripgrep or the browser worker
- symbol search through language/symbol providers

AI enters in three places:

1. Search view semantic/AI results
2. Search keyword suggestions
3. Settings search AI toggle, which is adjacent but separate from code/workspace search

Repo evidence:

- AI provider type exists in the search service:
  - `src/vs/workbench/services/search/common/search.ts:45-70`
  - `src/vs/workbench/services/search/common/searchService.ts:32-38`
- Search view preview settings:
  - `src/vs/workbench/contrib/search/browser/search.contribution.ts:395-412`
- Search with AI action and keybinding `Cmd/Ctrl+I`:
  - `src/vs/workbench/contrib/search/browser/searchActionsTopBar.ts:208-220`
- Search view AI UI/fallback behavior:
  - `src/vs/workbench/contrib/search/browser/searchView.ts:1740-1751`
  - `src/vs/workbench/contrib/search/browser/searchView.ts:1931-1976`
- AI provider APIs:
  - `src/vs/workbench/api/common/extHostSearch.ts:24-26`
  - `src/vs/workbench/api/common/extHostSearch.ts:100-113`
  - `src/vs/workbench/api/browser/mainThreadSearch.ts:48-53`

Official release notes confirm this is preview/optional behavior:

- VS Code 1.101: semantic search behavior options and keyword suggestions in Search view
  - https://code.visualstudio.com/updates/v1_101

What this means in practice:

- a normal text search is still non-AI and deterministic
- AI search is a second lane for semantic matching
- the UI only exposes the AI lane when an AI provider is available
- AI does not replace ripgrep, it supplements it

## 7. UX assessment from a user's perspective

### What VS Code does well

- Fast keyboard-first access
  - `Cmd/Ctrl+Shift+F`, `Cmd/Ctrl+P`, `Cmd/Ctrl+T`, `%`
- Strong workspace-centric developer workflow
- Very capable regex/include/exclude/replace support
- Good bridge between transient search and persistent search
  - Search view <-> Quick Search <-> Search Editor
- Strong extensibility model
- Sensible default performance path via ripgrep

### What feels fragmented

The search experience is logically unified only if you already know VS Code well.

For many users, these feel like separate products:

- Quick Open
- Search view
- Search Editor
- workspace symbol search
- Quick Search

That is powerful, but the mental model is not simple.

### What feels discoverable vs hidden

Discoverable:

- Search icon in Activity Bar
- `Cmd/Ctrl+Shift+F`
- standard regex/case/whole-word toggles

Less discoverable:

- `%` Quick Search
- `#` workspace symbol prefix
- Search Editor mode
- open-editors-only toggle
- include/exclude semantics differences vs settings globs
- why excludes/ignores changed results
- AI semantic search behavior options

### What this UX optimizes for

VS Code search optimizes for:

- developers working inside a known workspace
- users comfortable with keyboard shortcuts and command palette
- users who accept multiple specialized search surfaces instead of one unified omnibox

It is less optimized for:

- arbitrary-folder one-off searches
- users who want one persistent multi-query search dashboard
- users who want JetBrains-style split search panes and stronger result ranking explanations

## 8. What users are saying

This is not a statistical sample. It is a signal check across official docs/issues/wiki and public posts.

### Broad pattern

The public signal is mixed-but-meaningful:

- many users clearly find VS Code search good enough or strong, especially when excludes are configured correctly
- the biggest recurring complaint is not raw speed, but mental model and workflow friction

### Recurring pain point 1: excludes and ignore files are confusing

This is the clearest pattern. The official VS Code Search Issues wiki explicitly says:

- the most common reason for missing results is exclude settings and ignore files
- users often accidentally disable the "Use Exclude Settings and Ignore Files" toggle
- open-editors-only mode can further confuse expectations

Source:

- https://github.com/microsoft/vscode/wiki/Search-Issues

Most relevant lines when accessed today:

- missing results and ignore-file confusion
- open-editors-only behavior
- large-workspace narrowing advice

### Recurring pain point 2: people want more persistent/multiple searches

There is a longstanding GitHub issue requesting multiple active searches, with a tabbed "Searches" concept:

- https://github.com/microsoft/vscode/issues/16488

This does not mean VS Code has no answer today. Search Editor partially covers the need. But the request itself is evidence that users often want more than a single sidebar-bound live search state.

### Recurring pain point 3: searching outside the current workspace is awkward

A representative public complaint from July 31, 2021:

- a user migrating from Notepad++ said VS Code's Find in Files was good for workspace development but not for arbitrary folders with preconfigured filters
- replies mostly suggested opening another workspace/window or falling back to grep/fzf

Source:

- https://www.reddit.com/r/vscode/comments/ov7jxf/so_close_to_getting_rid_of_notepad_but_i_cant/

This is still a useful signal because it points to a structural design choice, not a transient bug: VS Code search is workspace-first.

### Recurring pain point 4: large-project search UX is not universally loved

A recent November 22, 2025 Reddit thread from someone who built an alternative extension around VS Code global search said:

- they found VS Code global search confusing in larger projects
- another commenter said VS Code search was "pretty good" if noisy artifacts were excluded
- other commenters explicitly preferred PhpStorm's split search window

Source:

- https://www.reddit.com/r/webdev/comments/1p3s97i/i_hated_vs_codes_global_search_so_i_forked_it/

My read: the product is solid, but "large repo search UX" is still contested, especially among users coming from JetBrains tools.

## 9. What should be improved

These are my recommendations based on the repo, official docs, and public feedback. They are partly evidence-based and partly inference from the evidence.

### 1. Make the search surfaces feel more unified

Current state:

- Search view
- Quick Search
- Quick Open
- Search Editor

all solve related problems with different mental models.

Improvement:

- expose a clearer "Search surfaces" model in the UI/help
- provide stronger handoff affordances between them
- consider a more obvious "pin this search as Search Editor" flow from the sidebar

### 2. Explain result inclusion/exclusion more explicitly

This is the biggest support burden and the biggest source of "search is broken" reports.

Improvement:

- show a more visible per-search explanation of active excludes/ignores
- add an inspect/explain mechanism for "why file X was excluded"
- make the open-editors-only state harder to miss

### 3. Improve discoverability of power features

Hidden or under-taught features include:

- `%` Quick Search
- `#` workspace symbols
- Search Editor
- book icon for open-editors-only search
- semantic search preview behavior

Improvement:

- inline affordances
- better empty states
- richer quick access help
- more explicit first-run/tooltips for advanced controls

### 4. Offer a better large-repo search presentation

Public sentiment suggests some users want:

- split search/result layouts
- stronger persistent result sets
- more confidence in ranking/relevance

Improvement:

- optional "large repo" or "analysis" search layout
- easier multi-search comparison
- more pinned searches without requiring the user to manually choose Search Editor every time

### 5. Support arbitrary-folder transient search better

This is where workspace-first design is weakest.

Improvement:

- easier temporary search roots
- one-off folder search without forcing workspace context switching
- more obvious multi-window or transient-root workflow

### 6. Keep AI clearly secondary and explicit

The current architecture is reasonable because it keeps AI as an overlay instead of corrupting deterministic search expectations.

Improvement:

- make AI result provenance even clearer
- keep exact/regex search deterministic and prominent
- explain when semantic search ran automatically vs manually

## 10. Bottom line

From a user's perspective, VS Code search is powerful, fast, and broader than it first appears. It covers file names, text, symbols, replace flows, quick transient search, persistent search documents, and now preview semantic/AI layers.

From an implementation perspective, it is a well-factored system:

- structured query builder
- provider-oriented search service
- ripgrep-backed desktop search
- web-worker-backed browser search
- extension APIs for file/text/AI search providers

From a UX perspective, it is very good for developers who live inside a workspace and learn the shortcuts. It is weaker for users who want a single obvious search model, a better arbitrary-folder workflow, or a more persistent large-repo search dashboard.

From an AI perspective, the answer is no for the core engine, yes for preview augmentation.

If I had to summarize it in one sentence:

VS Code search is a high-capability developer search toolkit with a strong engine and a fragmented mental model.

## Source index

### Local repo references

- `src/vs/workbench/contrib/search/browser/search.contribution.ts:63-129`
- `src/vs/workbench/contrib/search/browser/search.contribution.ts:164-412`
- `src/vs/workbench/contrib/search/browser/searchActionsFind.ts:222-275`
- `src/vs/workbench/contrib/search/browser/searchView.ts:475-536`
- `src/vs/workbench/contrib/search/browser/searchView.ts:1556-1668`
- `src/vs/workbench/contrib/search/browser/searchView.ts:1740-1806`
- `src/vs/workbench/contrib/search/browser/searchView.ts:1931-1976`
- `src/vs/workbench/contrib/search/browser/anythingQuickAccess.ts:97-119`
- `src/vs/workbench/contrib/search/browser/anythingQuickAccess.ts:207-219`
- `src/vs/workbench/contrib/search/browser/anythingQuickAccess.ts:414-466`
- `src/vs/workbench/contrib/search/browser/anythingQuickAccess.ts:619-724`
- `src/vs/workbench/contrib/search/browser/quickTextSearch/textSearchQuickAccess.ts:39-130`
- `src/vs/workbench/contrib/search/browser/quickTextSearch/textSearchQuickAccess.ts:178-257`
- `src/vs/workbench/contrib/search/browser/searchActionsSymbol.ts:15-33`
- `src/vs/workbench/contrib/search/browser/searchActionsTextQuickAccess.ts:18-35`
- `src/vs/workbench/contrib/search/browser/searchActionsTopBar.ts:208-220`
- `src/vs/workbench/contrib/searchEditor/browser/searchEditor.contribution.ts:73-103`
- `src/vs/workbench/contrib/searchEditor/browser/searchEditor.contribution.ts:211-230`
- `src/vs/workbench/services/search/common/search.ts:40-109`
- `src/vs/workbench/services/search/common/queryBuilder.ts:132-161`
- `src/vs/workbench/services/search/common/queryBuilder.ts:233-330`
- `src/vs/workbench/services/search/common/searchService.ts:28-80`
- `src/vs/workbench/services/search/common/searchService.ts:82-161`
- `src/vs/workbench/services/search/common/searchService.ts:173-221`
- `src/vs/workbench/services/search/common/searchService.ts:271-340`
- `src/vs/workbench/services/search/node/ripgrepFileSearch.ts:20-90`
- `src/vs/workbench/services/search/node/ripgrepTextSearchEngine.ts:24-154`
- `src/vs/workbench/services/search/browser/searchService.ts:32-190`
- `src/vs/workbench/api/common/extHostSearch.ts:21-114`
- `src/vs/workbench/api/common/extHostSearch.ts:170-216`
- `src/vs/workbench/api/browser/mainThreadSearch.ts:20-98`

### Official docs and release notes

- Search across files / Search Editor docs:
  - https://code.visualstudio.com/docs/editing/codebasics
- Code navigation docs:
  - https://code.visualstudio.com/docs/editing/editingevolved
- User Interface docs:
  - https://code.visualstudio.com/docs/getstarted/userinterface
- Custom Layout docs:
  - https://code.visualstudio.com/docs/configure/custom-layout
- VS Code 1.101 release notes:
  - https://code.visualstudio.com/updates/v1_101

### Public feedback and issue references

- Search Issues wiki:
  - https://github.com/microsoft/vscode/wiki/Search-Issues
- Feature request for multiple active searches:
  - https://github.com/microsoft/vscode/issues/16488
- Workspace-vs-arbitrary-folder complaint:
  - https://www.reddit.com/r/vscode/comments/ov7jxf/so_close_to_getting_rid_of_notepad_but_i_cant/
- Large-project/global-search critique with mixed replies:
  - https://www.reddit.com/r/webdev/comments/1p3s97i/i_hated_vs_codes_global_search_so_i_forked_it/
