# Project-Aware Background Agent Phase 1 Checklist

Status: Draft
Date: 2026-03-30
Depends on:
- `docs/planning/project-aware-background-agent-mvp-spec.md`
- `docs/planning/project-aware-background-agent-implementation-plan.md`

## Goal

Ship the smallest credible end-to-end version of the project-aware background agent MVP.

Phase 1 should deliver:

- docs-first project profiling
- narrow external research topic generation
- source policy enforcement
- suggestion synthesis and ranking
- local persistence for profile, suggestions, and feedback
- a new `Ideas` tab in the existing `agent` / `search` Dockview group
- manual refresh and lightweight feedback actions
- reuse of the current agent runtime in non-interactive mode, with fallback to the project default runtime

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `tsconfig.node.json` | Modify | Include `background-agent/**/*.ts` in the Node build |
| `tsconfig.web.json` | Modify | Include `background-agent/schemas/**/*.ts` in the web build |
| `background-agent/schemas/background-agent-types.ts` | Create | Shared DTOs for profile, suggestions, sources, status, feedback, and runtime context |
| `background-agent/connectors/local-project/local-project-loader.ts` | Create | Load README, docs, manifests, and recent project signals |
| `background-agent/connectors/local-project/repo-structure-summary.ts` | Create | Produce shallow repository structure signals |
| `background-agent/core/project-profile/project-profile-builder.ts` | Create | Build the docs-first project profile |
| `background-agent/core/research/research-topic-generator.ts` | Create | Generate research topics from the project profile |
| `background-agent/core/research/source-policy.ts` | Create | Enforce source allowlist and evidence rules |
| `background-agent/core/research/source-normalizer.ts` | Create | Normalize source records into one schema |
| `background-agent/core/synthesis/suggestion-synthesizer.ts` | Create | Turn research results into candidate suggestions |
| `background-agent/core/ranking/suggestion-ranker.ts` | Create | Rank and filter suggestions down to the MVP feed |
| `background-agent/core/feedback/feedback-policy.ts` | Create | Define accepted feedback values and ranking hooks |
| `background-agent/connectors/web/web-research-types.ts` | Create | Types for external research requests and responses |
| `background-agent/connectors/web/web-research-client.ts` | Create | Thin web research adapter interface for the host |
| `src/main/background-agent-host/background-agent-types.ts` | Create | Host-only types for orchestration and persistence |
| `src/main/background-agent-host/background-agent-runtime.ts` | Create | Resolve runtime and invoke it in non-interactive mode |
| `src/main/background-agent-host/background-agent-store.ts` | Create | Persist profile, suggestions, and feedback locally |
| `src/main/background-agent-host/background-agent-host.ts` | Create | Main orchestration entry point for the feature |
| `src/main/ipc/background-agent-handlers.ts` | Create | IPC handlers for list, refresh, feedback, and status |
| `src/main/ipc/types.ts` | Modify | Add background-agent host dependency wiring |
| `src/main/app/ipc-handlers.ts` | Modify | Register new background-agent IPC handlers |
| `src/preload/index.ts` | Modify | Allow background-agent invoke channels |
| `src/shared/electron-api.d.ts` | Modify | Keep renderer-side API typing aligned with new channels |
| `src/renderer/hooks/useBackgroundAgent.ts` | Create | Renderer data hook for loading, refreshing, and feedback |
| `src/renderer/components/background-agent/BackgroundAgentPanel.tsx` | Create | Main Ideas panel UI |
| `src/renderer/components/background-agent/BackgroundAgentPanel.styles.ts` | Create | Panel styling |
| `src/renderer/components/background-agent/BackgroundSuggestionCard.tsx` | Create | Suggestion card UI |
| `src/renderer/components/editor/dock-panels.tsx` | Modify | Register `backgroundAgent` panel component |
| `src/renderer/components/editor/dock-panel-types.ts` | Modify | Add only the state and actions the Ideas panel needs |
| `src/renderer/hooks/dock-layout-helpers.ts` | Modify | Add panel id, title, and restore hints |
| `src/renderer/hooks/dock-layout-builders.ts` | Modify | Add the new panel to the default layout within the `agent` group |
| `src/renderer/App.tsx` | Modify | Provide the new panel with state and actions via `DockStateContext` |
| `background-agent/tests/project-profile-builder.test.ts` | Create | Project profiling tests |
| `background-agent/tests/source-policy.test.ts` | Create | Source allowlist and evidence policy tests |
| `background-agent/tests/suggestion-ranker.test.ts` | Create | Ranking and filtering tests |
| `src/main/background-agent-host/background-agent-store.test.ts` | Create | Persistence tests |
| `src/main/background-agent-host/background-agent-runtime.test.ts` | Create | Runtime fallback and invocation tests |
| `src/main/ipc/background-agent-handlers.test.ts` | Create | IPC handler tests |
| `src/renderer/hooks/useBackgroundAgent.test.ts` | Create | Renderer hook tests |
| `src/renderer/components/background-agent/BackgroundAgentPanel.test.tsx` | Create | Panel smoke tests |

## Task 1: Create The Boundary And Schemas

**Files:**

- Modify: `tsconfig.node.json`
- Modify: `tsconfig.web.json`
- Create: `background-agent/schemas/background-agent-types.ts`

- [ ] Add `background-agent/**/*.ts` to `tsconfig.node.json`.
- [ ] Add `background-agent/schemas/**/*.ts` to `tsconfig.web.json`.
- [ ] Create `background-agent/schemas/background-agent-types.ts`.
- [ ] Define the core DTOs:
  - `BackgroundAgentProjectProfile`
  - `BackgroundAgentSuggestion`
  - `BackgroundAgentSuggestionSource`
  - `BackgroundAgentGenerationStatus`
  - `BackgroundAgentFeedbackType`
  - `BackgroundAgentRuntimeContext`
- [ ] Make sure the renderer can import schemas without importing any core logic.
- [ ] Verify that `background-agent/` has no imports from `src/main`, `src/renderer`, or `src/shared`.

## Task 2: Build Local Project Input Loading

**Files:**

- Create: `background-agent/connectors/local-project/local-project-loader.ts`
- Create: `background-agent/connectors/local-project/repo-structure-summary.ts`
- Create: `background-agent/core/project-profile/project-profile-builder.ts`

- [ ] Create `repo-structure-summary.ts` to gather shallow structure signals:
  - top-level directories
  - presence of docs/planning folders
  - presence of package manifests
  - high-level tech stack hints
- [ ] Create `local-project-loader.ts` to load:
  - `README*`
  - top-level docs
  - planning and architecture docs
  - package manifests
  - recent change hints where cheap to obtain
- [ ] Create `project-profile-builder.ts`.
- [ ] Build a docs-first, metadata-heavy project profile containing:
  - product type
  - target user
  - major workflows
  - architecture shape
  - dependency stack
  - likely open questions or growth areas
- [ ] Keep code analysis shallow. Do not add deep repository traversal in Phase 1.

## Task 3: Add The Research Topic Layer

**Files:**

- Create: `background-agent/core/research/research-topic-generator.ts`
- Create: `background-agent/core/research/source-policy.ts`
- Create: `background-agent/core/research/source-normalizer.ts`
- Create: `background-agent/connectors/web/web-research-types.ts`
- Create: `background-agent/connectors/web/web-research-client.ts`

- [ ] Create `research-topic-generator.ts`.
- [ ] Implement the three-ring similarity model:
  - Ring 1: direct competitors or same category
  - Ring 2: same-workflow tools
  - Ring 3: similar architecture or interaction patterns
- [ ] Create `source-policy.ts`.
- [ ] Encode the Phase 1 source policy:
  - allow official docs and changelogs
  - allow OSS repos, issues, and discussions
  - allow strong engineering blogs
  - allow forums only as supporting evidence
  - reject generic SEO content and low-signal chatter
- [ ] Create `source-normalizer.ts` to normalize titles, URLs, dates, and trust levels.
- [ ] Create `web-research-types.ts` for request and response shapes.
- [ ] Create `web-research-client.ts` as a thin interface the host can call for external research.

## Task 4: Build Suggestion Synthesis And Ranking

**Files:**

- Create: `background-agent/core/synthesis/suggestion-synthesizer.ts`
- Create: `background-agent/core/ranking/suggestion-ranker.ts`
- Create: `background-agent/core/feedback/feedback-policy.ts`

- [ ] Create `suggestion-synthesizer.ts`.
- [ ] Turn project profile + research evidence into candidate suggestions.
- [ ] Ensure each suggestion includes:
  - title
  - category
  - summary
  - why it matters for this project
  - source list
  - evidence notes
  - confidence
  - novelty estimate
  - effort / impact framing
  - created date
- [ ] Create `suggestion-ranker.ts`.
- [ ] Enforce the minimum evidence threshold:
  - at least one high-trust source
  - at least one corroborating signal
- [ ] Rank by:
  - relevance
  - evidence quality
  - novelty
  - feasibility
  - timeliness
- [ ] Cap the Phase 1 feed to 3-5 suggestions.
- [ ] Create `feedback-policy.ts`.
- [ ] Define the accepted feedback values:
  - `useful`
  - `not_relevant`
  - `obvious`
  - `weak_evidence`
  - `badly_timed`

## Task 5: Build The Main-Process Host

**Files:**

- Create: `src/main/background-agent-host/background-agent-types.ts`
- Create: `src/main/background-agent-host/background-agent-runtime.ts`
- Create: `src/main/background-agent-host/background-agent-store.ts`
- Create: `src/main/background-agent-host/background-agent-host.ts`

- [ ] Create `background-agent-types.ts` for host orchestration and persistence types.
- [ ] Create `background-agent-runtime.ts`.
- [ ] Implement runtime selection:
  - use the current active agent runtime when available
  - otherwise fall back to the project default runtime
- [ ] Invoke the selected runtime in non-interactive mode.
- [ ] Do not add a separate background-agent model picker.
- [ ] Create `background-agent-store.ts`.
- [ ] Persist:
  - latest project profile
  - latest generated suggestions
  - source references or normalized source records
  - feedback events
- [ ] Store data in a dedicated background-agent state file or folder under `~/.manifold/`.
- [ ] Create `background-agent-host.ts`.
- [ ] Implement orchestration methods:
  - `listSuggestions`
  - `refreshSuggestions`
  - `recordFeedback`
  - `getStatus`

## Task 6: Add IPC And Preload Wiring

**Files:**

- Create: `src/main/ipc/background-agent-handlers.ts`
- Modify: `src/main/ipc/types.ts`
- Modify: `src/main/app/ipc-handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/electron-api.d.ts`

- [ ] Create `background-agent-handlers.ts`.
- [ ] Add IPC channels:
  - `background-agent:list-suggestions`
  - `background-agent:refresh`
  - `background-agent:feedback`
  - `background-agent:get-status`
- [ ] Modify `src/main/ipc/types.ts` to add the background-agent host dependency.
- [ ] Modify `src/main/app/ipc-handlers.ts` to register the new handlers.
- [ ] Modify `src/preload/index.ts` to allow the new invoke channels.
- [ ] Keep `src/shared/electron-api.d.ts` aligned with the exposed API shape used in the renderer tests and code.

## Task 7: Add The Renderer Hook And Panel

**Files:**

- Create: `src/renderer/hooks/useBackgroundAgent.ts`
- Create: `src/renderer/components/background-agent/BackgroundAgentPanel.tsx`
- Create: `src/renderer/components/background-agent/BackgroundAgentPanel.styles.ts`
- Create: `src/renderer/components/background-agent/BackgroundSuggestionCard.tsx`

- [ ] Create `useBackgroundAgent.ts`.
- [ ] Load suggestions for the active project.
- [ ] Expose:
  - suggestions
  - loading state
  - refresh action
  - feedback action
  - status
  - error state
- [ ] Create `BackgroundAgentPanel.tsx`.
- [ ] Render the initial states:
  - no project selected
  - empty / no suggestions yet
  - loading
  - populated feed
  - empty result after refresh
  - error
- [ ] Create `BackgroundSuggestionCard.tsx`.
- [ ] Show:
  - title
  - category
  - why-now summary
  - source list
  - confidence / novelty / effort framing
  - feedback controls
- [ ] Create `BackgroundAgentPanel.styles.ts`.

## Task 8: Wire The Panel Into Dockview

**Files:**

- Modify: `src/renderer/components/editor/dock-panels.tsx`
- Modify: `src/renderer/components/editor/dock-panel-types.ts`
- Modify: `src/renderer/hooks/dock-layout-helpers.ts`
- Modify: `src/renderer/hooks/dock-layout-builders.ts`
- Modify: `src/renderer/App.tsx`

- [ ] Add a `backgroundAgent` panel component to `dock-panels.tsx`.
- [ ] Title the panel `Ideas`.
- [ ] Update `dock-layout-helpers.ts`:
  - add `backgroundAgent` to `PANEL_IDS`
  - add `Ideas` to `PANEL_TITLES`
  - add restore hints so the panel lives with `agent` and `search`
- [ ] Update `dock-layout-builders.ts`:
  - add the panel within the `agent` group
  - keep it inactive by default
- [ ] Update `dock-panel-types.ts` with only the fields/actions needed by the new panel.
- [ ] Update `src/renderer/App.tsx` to pass the new background-agent state and actions into `DockStateContext`.

## Task 9: Add Tests For Phase 1 Boundaries

**Files:**

- Create: `background-agent/tests/project-profile-builder.test.ts`
- Create: `background-agent/tests/source-policy.test.ts`
- Create: `background-agent/tests/suggestion-ranker.test.ts`
- Create: `src/main/background-agent-host/background-agent-store.test.ts`
- Create: `src/main/background-agent-host/background-agent-runtime.test.ts`
- Create: `src/main/ipc/background-agent-handlers.test.ts`
- Create: `src/renderer/hooks/useBackgroundAgent.test.ts`
- Create: `src/renderer/components/background-agent/BackgroundAgentPanel.test.tsx`

- [ ] Add project profile builder tests.
- [ ] Add source policy tests for allowed vs rejected sources.
- [ ] Add ranking tests for evidence threshold and feed capping.
- [ ] Add runtime tests for active-session runtime reuse and default-runtime fallback.
- [ ] Add persistence tests for loading and saving state.
- [ ] Add IPC handler tests for refresh, list, feedback, and status.
- [ ] Add renderer hook tests for load and refresh flow.
- [ ] Add panel smoke tests for basic states and feedback controls.

## Verification Checklist

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] Manually verify the `Ideas` tab appears in the `agent` / `search` group
- [ ] Manually verify refresh loads suggestions for the active project
- [ ] Manually verify feedback actions persist without breaking the panel
- [ ] Manually verify runtime fallback works when no active agent session exists

## Phase 1 Done Criteria

- [ ] Project profile generation works from docs and metadata
- [ ] Research topic generation uses the three-ring similarity model
- [ ] Source policy and evidence threshold are enforced
- [ ] Suggestions are ranked and capped to a small feed
- [ ] The `Ideas` tab is visible and usable
- [ ] The feature works with the current agent runtime and project default fallback
- [ ] The feature remains isolated enough to remove later with limited changes
