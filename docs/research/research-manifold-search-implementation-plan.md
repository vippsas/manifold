# Manifold Search: Concrete Implementation Plan

Written: 2026-03-22

Scope: This implementation plan turns the three search pillars into concrete engineering work. It is based on:

- `docs/research/research-manifold-search-three-pillars.md`
- `docs/research/research-vscode-search.md`
- `docs/research/research-manifold-search.md`
- `docs/research/research-gap-manifold-vs-vscode-search.md`

## Goals

This plan is optimized for three outcomes:

1. a unified search model
2. AI search across memory and all agents
3. strong basic text match search

The plan deliberately prioritizes exact search and product coherence before semantic or AI-heavy features.

## End-state architecture

The intended end state is:

- `Local Find` stays inside Monaco
- a dedicated `Search` panel handles `Code`, `Memory`, and later `Everything`
- `Memory` remains a timeline/history panel, not the main search shell
- one shared search request/response model is used across renderer and main
- code search and memory search are separate engines behind one orchestration layer
- AI search reranks or synthesizes over retrieved results and always cites sources

## Proposed shared types

Add a new shared file:

- `src/shared/search-types.ts`

Proposed starting types:

```ts
export type SearchMode = 'code' | 'memory' | 'everything'

export type SearchScopeKind =
  | 'active-session'
  | 'visible-roots'
  | 'all-project-sessions'
  | 'memory-only'

export type SearchMatchMode = 'literal' | 'regex'

export interface SearchScopeDescriptor {
  kind: SearchScopeKind
  sessionIds?: string[]
  rootPaths?: string[]
  includeAdditionalDirs?: boolean
}

export interface SearchQueryRequest {
  projectId: string
  activeSessionId: string | null
  mode: SearchMode
  query: string
  scope: SearchScopeDescriptor
  matchMode: SearchMatchMode
  caseSensitive: boolean
  wholeWord: boolean
  includeGlobs?: string[]
  excludeGlobs?: string[]
  limit?: number
  contextLines?: number
  ai?: {
    enabled: boolean
    rerank?: boolean
    answer?: boolean
  }
}

export interface SearchContextSession {
  sessionId: string
  branchName: string
  runtimeId: string
  worktreePath: string
  additionalDirs: string[]
  status: 'running' | 'waiting' | 'done' | 'error'
}

export interface SearchContextResponse {
  projectId: string
  activeSessionId: string | null
  sessions: SearchContextSession[]
}

export interface SearchResultBase {
  id: string
  source: 'code' | 'memory'
  title: string
  snippet: string
  score?: number
  sessionId?: string
  branchName?: string
  runtimeId?: string
}

export interface CodeSearchResult extends SearchResultBase {
  source: 'code'
  filePath: string
  rootPath: string
  relativePath: string
  line: number
  column?: number
  contextBefore?: string[]
  contextAfter?: string[]
}

export interface MemorySearchResultItem extends SearchResultBase {
  source: 'memory'
  memorySource: 'observation' | 'session_summary' | 'interaction'
  createdAt: number
  concepts?: string[]
  filesTouched?: string[]
}

export type UnifiedSearchResult = CodeSearchResult | MemorySearchResultItem

export interface SearchQueryResponse {
  results: UnifiedSearchResult[]
  total: number
  tookMs: number
  warnings?: string[]
}

export interface SearchAskResponse {
  answer: string
  citations: UnifiedSearchResult[]
  tookMs: number
}
```

## Proposed IPC

Add these channels to the unified search path:

- `search:context`
- `search:query`
- `search:ask`

Meaning:

- `search:context` returns available project sessions and worktree roots
- `search:query` returns unified code and/or memory results
- `search:ask` performs grounded AI synthesis over retrieved results

Existing channels to keep temporarily during migration:

- `files:search-content`
- `memory:search`
- `view:show-search`

These should be treated as legacy compatibility paths and removed only after the new search panel is stable.

## Proposed file-open change

To support line-accurate navigation, extend:

- `src/renderer/components/editor/file-open-request.ts`

Current:

```ts
export interface FileOpenRequest {
  path: string | null
  source: FileOpenSource
}
```

Proposed:

```ts
export type FileOpenSource =
  | 'default'
  | 'fileTree'
  | 'markdownPreview'
  | 'search'
  | 'memory'

export interface FileOpenRequest {
  path: string | null
  line?: number
  column?: number
  source: FileOpenSource
}
```

Then update `handleSelectFile`-style APIs to accept a structured target rather than only a string path.

## Phase 0: Foundations

### Goal

Introduce the shared types, shared IPC skeleton, and a dedicated `Search` panel without changing all behavior at once.

### Main files

New:

- `src/shared/search-types.ts`
- `src/main/ipc/search-handlers.ts`
- `src/main/search/search-context-service.ts`
- `src/renderer/hooks/useSearch.ts`
- `src/renderer/components/search/SearchPanel.tsx`
- `src/renderer/components/search/SearchPanel.styles.ts`

Updated:

- `src/preload/index.ts`
- `src/main/ipc/types.ts`
- `src/main/app/ipc-handlers.ts`
- `src/main/app/app-menu.ts`
- `src/renderer/hooks/useAppEffects.ts`
- `src/renderer/hooks/dock-layout-helpers.ts`
- `src/renderer/hooks/dock-layout-builders.ts`
- `src/renderer/components/editor/dock-panels.tsx`
- `src/renderer/components/editor/dock-panel-types.ts`
- `src/renderer/App.tsx`

### Work

1. Add `search` as a new dock panel id and panel title.
2. Keep `view:show-search`, but change it to focus the new `search` panel instead of the `Files` tab.
3. Add `search:context` and return the current project's discovered sessions from `sessionManager.listSessions()` or `discoverSessionsForProject(...)`.
4. Create `useSearch` as the renderer-side owner of shared search state.
5. Add the panel shell with tabs for `Code`, `Memory`, and disabled/placeholder `Everything`.

### Output

At the end of Phase 0:

- the app has a dedicated search panel
- renderer and main have shared search types
- no end-state features are complete yet, but the architecture is in place

## Phase 1: Basic Text Match Search v2

### Goal

Replace the current lightweight code search with a proper scope-aware, line-accurate code search workflow.

### Main files

New:

- `src/main/search/code-search-service.ts`
- `src/main/search/search-engine.ts`
- `src/main/search/ripgrep-engine.ts`
- `src/main/search/gitgrep-fallback.ts`
- `src/renderer/components/search/CodeSearchView.tsx`
- `src/renderer/components/search/SearchResultList.tsx`
- `src/renderer/components/search/SearchQueryBar.tsx`
- `src/renderer/components/search/SearchScopeBar.tsx`

Updated:

- `package.json`
- `package-lock.json`
- `src/main/ipc/search-handlers.ts`
- `src/preload/index.ts`
- `src/renderer/hooks/useSearch.ts`
- `src/renderer/App.tsx`
- `src/renderer/hooks/useCodeView.ts`
- `src/renderer/hooks/useCodeViewFileOps.ts`
- `src/renderer/components/editor/CodeViewer.tsx`
- `src/renderer/components/editor/file-open-request.ts`
- `src/renderer/components/editor/SearchResults.tsx`

### Work

1. Introduce a code-search service that accepts `SearchQueryRequest` and returns `CodeSearchResult[]`.
2. Prefer ripgrep as the main engine.
3. Use Git grep only as a fallback during migration if ripgrep is unavailable.
4. Support these controls from day one:
   - literal vs regex
   - case-sensitive
   - whole-word
   - scope
5. Support these scopes from day one:
   - active session worktree
   - visible roots
   - all project sessions
6. Add line and column to code search results.
7. Extend file open so search hits reveal the exact location in Monaco.
8. Add context snippets and highlighted text.
9. Add debounced query execution and cancellation for stale requests.

### Output

At the end of Phase 1:

- `Cmd/Ctrl+Shift+F` opens a proper code search flow
- code search is scope-aware
- results open the exact file location
- users can trust basic text match search

## Phase 2: Unified Search Model

### Goal

Make code search and memory search feel like one product instead of two separate panels with unrelated behavior.

### Main files

New:

- `src/renderer/components/search/MemorySearchView.tsx`
- `src/renderer/components/search/UnifiedSearchResultRow.tsx`
- `src/renderer/components/search/SearchEmptyState.tsx`

Updated:

- `src/renderer/components/search/SearchPanel.tsx`
- `src/renderer/hooks/useSearch.ts`
- `src/main/ipc/search-handlers.ts`
- `src/main/ipc/memory-handlers.ts`
- `src/renderer/components/memory/MemoryPanelContent.tsx`
- `src/shared/memory-types.ts`

### Work

1. Add a memory adapter in `search:query` so memory results can be returned in the unified result shape.
2. Reuse the same query bar and scope controls for both `Code` and `Memory`.
3. Keep memory-only filters such as observation type and concept chips, but render them inside the same search shell.
4. Reposition `MemoryPanel` as timeline/history/inspection rather than the primary search entry point.
5. Add mixed-result rendering support for the future `Everything` mode.

### Output

At the end of Phase 2:

- `Code` and `Memory` search share one shell
- users see one search system, not two unrelated ones
- the old `SearchResults.tsx` path can be retired

## Phase 3: Everything Search Across Memory And All Agents

### Goal

Introduce a project-wide search mode that merges code hits from all selected worktrees with memory hits from the project's stored history.

### Main files

New:

- `src/main/search/project-search-service.ts`
- `src/main/search/result-merger.ts`
- `src/renderer/components/search/EverythingSearchView.tsx`

Updated:

- `src/main/ipc/search-handlers.ts`
- `src/renderer/hooks/useSearch.ts`
- `src/renderer/components/search/SearchPanel.tsx`

### Work

1. Use `sessionManager.listSessions()` or project-scoped discovery to enumerate all relevant sessions.
2. Search all selected worktree roots and `additionalDirs` where appropriate.
3. Merge code and memory results into one sorted response.
4. Attach branch, worktree, runtime, and session metadata to every result row.
5. Add scope chips such as:
   - Active agent
   - All agents
   - Memory
   - Everything

### Output

At the end of Phase 3:

- Manifold can search across all agents for a project
- result rows identify which agent/worktree/branch they come from
- `Everything` becomes a real feature, not a placeholder

## Phase 4: AI Search

### Goal

Add grounded AI reranking and grounded AI answers on top of the exact retrieval stack.

### Main files

New:

- `src/main/search/ai-search-service.ts`
- `src/main/search/search-prompt-builder.ts`
- `src/renderer/components/search/AiAnswerPanel.tsx`

Updated:

- `src/main/ipc/search-handlers.ts`
- `src/main/memory/memory-store.ts`
- `src/main/memory/memory-compressor.ts`
- `src/shared/search-types.ts`
- `src/renderer/hooks/useSearch.ts`
- `src/renderer/components/search/SearchPanel.tsx`
- `src/main/store/settings-store.ts`
- `src/shared/types.ts`

### Work

1. Add `search:ask`.
2. Use `search:query` retrieval as the grounding layer.
3. Pass top-ranked code and memory results into AI synthesis.
4. Return:
   - answer text
   - citations
   - latency
5. Optionally support AI reranking on `search:query` before full answer synthesis.
6. Add settings for:
   - AI search enabled
   - rerank only vs answer mode
   - runtime/model selection if needed

### Output

At the end of Phase 4:

- users can ask grounded project questions across all agents and memory
- every answer cites sources
- exact search remains fully usable without AI

## Phase 5: Persistence And Workflow Polish

### Goal

Add the workflow capabilities that make search useful over longer investigative sessions.

### Main files

New:

- `src/shared/search-view-state.ts`
- `src/main/store/search-view-store.ts`
- `src/renderer/components/search/SavedSearchView.tsx`

Updated:

- `src/main/ipc/search-handlers.ts`
- `src/renderer/hooks/useSearch.ts`
- `src/renderer/components/search/SearchPanel.tsx`

### Work

1. Add saved or pinned search sessions.
2. Add keyboard-first result traversal across all modes.
3. Add result preview/open-in-pane/open-in-new-pane actions.
4. Add recent searches and saved scopes.

### Output

At the end of Phase 5:

- Manifold search supports longer-lived investigative workflows
- users can revisit or compare searches instead of rerunning everything manually

## Migration plan for current code

Short term:

- keep `files:search-content` and `memory:search`
- keep `SearchResults.tsx`
- keep `MemoryPanelContent.tsx` search behavior

Mid migration:

- route new `SearchPanel` through `search:query`
- make old code-search UI a thin wrapper over new code search service if needed

End state:

- remove the old `Files -> Search` tab
- keep `Files` for file tree only
- keep `Memory` for timeline/history only

## Suggested tests

New tests to add:

- `src/main/search/code-search-service.test.ts`
- `src/main/search/project-search-service.test.ts`
- `src/main/search/ai-search-service.test.ts`
- `src/main/ipc/search-handlers.test.ts`
- `src/renderer/hooks/useSearch.test.ts`
- `src/renderer/components/search/SearchPanel.test.tsx`
- `src/renderer/components/search/CodeSearchView.test.tsx`
- `src/renderer/components/search/MemorySearchView.test.tsx`

Existing tests likely needing updates:

- `src/main/memory/memory-store.test.ts`
- `src/renderer/components/memory/MemoryPanelContent.test.tsx`
- `src/renderer/hooks/useCodeView.test.ts`

## Recommended order of execution

If this is implemented incrementally, the best order is:

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 4
6. Phase 5

That order keeps risk low and ensures AI search is built on top of a search system users already trust.

## Bottom line

The critical design decision is to treat search as a product system, not a pair of panel-specific widgets.

If Manifold implements:

- one shared search model
- one reliable code-search backend
- one project-wide retrieval layer
- AI as grounded synthesis over retrieved sources

then it can become stronger than VS Code on the part VS Code does not naturally own: searching across multiple agents, worktrees, and accumulated project memory.
