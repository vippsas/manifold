# Project-Aware Background Agent MVP Implementation Plan

Status: Draft
Date: 2026-03-30
Depends on:
- `docs/planning/context-aware-engineering-partner.md`
- `docs/planning/project-aware-background-agent-mvp-spec.md`
- `docs/planning/project-aware-background-agent-phase-1-checklist.md`

## Purpose

This document turns the project-aware background agent MVP spec into an implementation plan.

The goal of the MVP is to ship a source-backed idea feed inside Manifold that:

- understands the current project from PM and architect altitude
- researches the outside world using a narrow set of trusted source classes
- generates a small number of ranked suggestions
- lets the user refresh and give feedback from inside the app

The implementation plan is intentionally shaped around one core constraint: the background agent must live in an isolated top-level folder with minimal dependencies on the rest of the app, and the main product should be able to remove it later with limited changes.

## MVP Outcome

The MVP is complete when Manifold can:

1. build a docs-first project profile for the active project
2. run a narrow external research pipeline
3. generate 3-5 ranked suggestions with sources and reasoning
4. show those suggestions in a new dock tab in the existing `agent` / `search` group
5. let the user manually refresh and record lightweight feedback
6. reuse the current agent runtime in non-interactive mode, falling back to the project default runtime when needed

## Scope

In scope:

- isolated `background-agent/` module
- thin host adapter under `src/main`
- new Dockview tab for the ideas feed
- on-demand generation and refresh
- local persistence for project profile, suggestions, and feedback
- limited source policy and evidence threshold enforcement

Out of scope for this implementation plan:

- scheduled digests
- push notifications or aggressive proactive interruptions
- direct code modification or autonomous task execution
- deep code analysis
- broad PR review automation
- advanced multi-user collaboration workflows

## Implementation Principles

- Keep the core agent logic outside `src/main`, `src/renderer`, and `src/shared`.
- Make the host adapter narrow and replaceable.
- Prefer contracts and schemas over direct app-internal imports.
- Keep the first UI small and readable rather than trying to solve every workflow.
- Prefer silence over weak suggestions.
- Build for removal: if the feature is deleted later, most changes should be isolated to `background-agent/`, `src/main/background-agent-host/`, IPC registration, and the panel wiring.

## Current Repo Anchors

The implementation should align with existing patterns already in the codebase:

- Dockview panels are registered in `src/renderer/components/editor/dock-panels.tsx`
- panel ids, titles, and restore hints live in `src/renderer/hooks/dock-layout-helpers.ts`
- the default layout is created in `src/renderer/hooks/dock-layout-builders.ts`
- search already uses a dedicated renderer panel and main-process handler flow
- AI runtime selection already has a precedent in `src/main/search/search-ai-runtime.ts`
- IPC channels are registered through `src/main/app/ipc-handlers.ts` and exposed in `src/preload/index.ts`
- lightweight persisted UI state already exists through JSON-backed stores such as `src/main/store/search-view-store.ts`

These patterns should be reused where they help, but the background agent core should not become another `src/main/search/*` subtree.

## Proposed Architecture

The MVP should be split into three layers:

### 1. Agent Core

Lives in `background-agent/`.

Responsibilities:

- project profiling
- research topic generation
- source filtering and normalization
- suggestion synthesis
- ranking
- feedback-aware ranking adjustments
- DTO and schema ownership

### 2. Host Adapter

Lives in `src/main/background-agent-host/`.

Responsibilities:

- loading local project inputs for the active project
- selecting the AI runtime
- calling the core agent
- invoking the external research connector
- persisting profile, suggestions, and feedback
- exposing a small IPC surface to the renderer

### 3. Renderer Surface

Lives in `src/renderer/components/background-agent/` plus Dockview wiring.

Responsibilities:

- render the idea feed
- show loading, empty, and error states
- let the user refresh suggestions
- let the user give feedback on suggestions
- open source links and show timestamps and evidence snippets

## UI Placement

The MVP should add a new Dockview panel in the same group that already contains `agent` and `search`.

Implementation decision:

- panel id: `backgroundAgent`
- initial title: `Ideas`
- placement: `within` the existing `agent` group in the default layout

This maps cleanly onto the current Dockview architecture. It should be implemented as a first-class panel, not as an extra nested tab inside the existing search component.

## Packaging And Build Boundary

The top-level `background-agent/` folder is not included in the current TypeScript config by default.

The MVP therefore needs explicit build changes:

- add `background-agent/**/*.ts` to `tsconfig.node.json`
- add `background-agent/schemas/**/*.ts` to `tsconfig.web.json`

This keeps the agent core available to the main process while allowing the renderer to import stable DTO types from `background-agent/schemas/` without going through `src/shared`.

## Candidate File Layout

### New top-level agent module

```text
background-agent/
  schemas/
    background-agent-types.ts
  core/
    project-profile/
      project-profile-builder.ts
    research/
      research-topic-generator.ts
      source-policy.ts
      source-normalizer.ts
    synthesis/
      suggestion-synthesizer.ts
    ranking/
      suggestion-ranker.ts
    feedback/
      feedback-policy.ts
  connectors/
    local-project/
      local-project-loader.ts
      repo-structure-summary.ts
    web/
      web-research-client.ts
      web-research-types.ts
  tests/
```

### New host adapter

```text
src/main/background-agent-host/
  background-agent-host.ts
  background-agent-runtime.ts
  background-agent-store.ts
  background-agent-types.ts
```

### New IPC and renderer files

```text
src/main/ipc/background-agent-handlers.ts

src/renderer/components/background-agent/
  BackgroundAgentPanel.tsx
  BackgroundAgentPanel.styles.ts
  BackgroundSuggestionCard.tsx

src/renderer/hooks/
  useBackgroundAgent.ts
```

### Existing files expected to change

- `src/main/app/ipc-handlers.ts`
- `src/main/ipc/types.ts`
- `src/preload/index.ts`
- `src/renderer/components/editor/dock-panels.tsx`
- `src/renderer/components/editor/dock-panel-types.ts`
- `src/renderer/hooks/dock-layout-helpers.ts`
- `src/renderer/hooks/dock-layout-builders.ts`
- `tsconfig.node.json`
- `tsconfig.web.json`

## Workstreams

### 1. Schemas And Boundary Setup

Create the stable contracts first.

Tasks:

- add `background-agent/schemas/background-agent-types.ts`
- define DTOs for:
  - project profile
  - suggestion
  - suggestion source
  - generation status
  - feedback event
  - runtime context
- update `tsconfig.node.json` and `tsconfig.web.json` to include the new folder
- ensure renderer imports only schemas, never core internals

Acceptance criteria:

- node and web typecheck can import the new schemas
- `background-agent/` has no imports from `src/main`, `src/renderer`, or `src/shared`

### 2. Local Project Profiling

Build the docs-first, metadata-heavy project profile defined in the MVP spec.

Tasks:

- implement `local-project-loader.ts` to load:
  - README and top-level docs
  - planning or architecture docs
  - package manifests
  - shallow repository structure signals
  - recent change summaries where cheaply available
- implement `project-profile-builder.ts`
- produce a compact profile with:
  - product type
  - target user
  - major workflows
  - architecture shape
  - dependency stack
  - likely open questions or growth areas

Acceptance criteria:

- the host can generate a stable project profile for a local project path
- the profile is based primarily on docs and metadata, not deep code traversal

### 3. External Research Pipeline

Add the first narrow external research flow.

Tasks:

- implement `research-topic-generator.ts`
- use the three-ring similarity model:
  - direct competitors or same category
  - same-workflow tools
  - similar architecture or interaction patterns
- implement `source-policy.ts`
- restrict v1 primary inputs to:
  - official docs
  - changelogs
  - OSS repos
  - OSS issues and discussions
  - strong engineering blogs
- treat forums and practitioner communities as supporting evidence only
- exclude generic SEO blog content and low-signal social chatter

Acceptance criteria:

- the research layer can generate focused research topics from a project profile
- the source policy rejects unsupported sources before synthesis

### 4. Suggestion Synthesis And Ranking

Turn research material into the MVP suggestion feed.

Tasks:

- implement `suggestion-synthesizer.ts`
- implement `suggestion-ranker.ts`
- enforce the evidence threshold:
  - at least one high-trust source
  - at least one corroborating signal
- rank by:
  - relevance
  - evidence quality
  - novelty
  - feasibility
  - timeliness
- cap output to a small feed of 3-5 suggestions

Acceptance criteria:

- generated suggestions always include source metadata
- weak, generic, or unsupported suggestions are filtered out

### 5. Host Adapter, Runtime, And Persistence

Wire the core into the main process without leaking app details into it.

Tasks:

- implement `background-agent-host.ts` as the orchestration entry point
- implement `background-agent-runtime.ts`
- resolve the runtime as:
  - current active agent runtime when available
  - otherwise project default runtime
- invoke the runtime in non-interactive mode
- do not add a separate background-agent model picker
- implement `background-agent-store.ts`
- persist:
  - latest project profile
  - cached suggestions
  - source references
  - feedback events

Recommended storage shape:

- keep storage local and file-based under `~/.manifold/`
- prefer a dedicated background-agent state file or folder instead of extending unrelated stores

Acceptance criteria:

- host logic can refresh suggestions for a project without renderer involvement
- runtime selection behaves deterministically
- persisted state survives app restart

### 6. IPC And Preload Surface

Expose the host adapter with a small API.

Tasks:

- add `src/main/ipc/background-agent-handlers.ts`
- register handlers from `src/main/app/ipc-handlers.ts`
- expose channels in `src/preload/index.ts`

Initial IPC surface:

- `background-agent:list-suggestions`
- `background-agent:refresh`
- `background-agent:feedback`
- `background-agent:get-status`

Acceptance criteria:

- renderer can load, refresh, and submit feedback without importing main-process code
- the IPC surface remains narrow and feature-specific

### 7. Renderer Panel

Add the first user-facing surface.

Tasks:

- add `BackgroundAgentPanel.tsx`
- add `BackgroundSuggestionCard.tsx`
- add `useBackgroundAgent.ts`
- add a new `backgroundAgent` panel component to `dock-panels.tsx`
- update `dock-layout-helpers.ts`:
  - add panel id
  - add panel title
  - add restore hints
- update `dock-layout-builders.ts`:
  - add the panel within the `agent` group
  - keep it inactive by default
- extend `dock-panel-types.ts` only with the minimum data and actions the panel needs

Initial panel states:

- no project selected
- idle with no suggestions yet
- loading
- populated feed
- empty result
- error

Initial panel actions:

- refresh ideas
- mark useful
- mark not relevant
- mark obvious
- open source link

Acceptance criteria:

- the new `Ideas` tab appears alongside `Agent` and `Search`
- refresh and feedback actions work end to end

### 8. Testing

Cover the boundaries most likely to regress.

Priority tests:

- project profile builder tests
- source policy tests
- suggestion ranking tests
- runtime fallback tests
- persistence store tests
- IPC handler tests
- renderer panel smoke tests

The first round of tests should focus more on correctness of boundaries and policy than on snapshotting complex UI details.

## Dependency Map

Recommended build order:

1. schemas and TypeScript config
2. local project profiling
3. source policy and research topic generation
4. suggestion synthesis and ranking
5. host adapter, runtime resolution, and persistence
6. IPC and preload
7. renderer panel and Dockview wiring
8. tests and hardening

This order keeps the core logic testable before UI wiring begins.

## Phase 1 Delivery Slice

Phase 1 should validate the product with the smallest credible end-to-end slice.

Phase 1 deliverables:

- top-level `background-agent/` skeleton
- docs-first project profile builder
- narrow research topic generation
- source policy enforcement
- suggestion synthesis and ranking for a 3-5 item feed
- local persistence for profile, suggestions, and feedback
- `Ideas` tab in the existing `agent` / `search` Dockview group
- manual refresh and simple feedback actions
- runtime reuse in non-interactive mode with fallback to project default runtime

Phase 1 non-goals:

- scheduled background refresh
- richer personalization
- notifications
- multiple suggestion feed modes
- deeper code-aware architectural analysis

## Phase 1 Acceptance Criteria

Phase 1 is done when:

1. a project can open the `Ideas` tab and request suggestions
2. the host builds a project profile from local docs and metadata
3. the agent runs the research and synthesis pipeline
4. the feed shows 3-5 suggestions with sources, dates, and reasoning
5. unsupported or weakly evidenced suggestions are filtered out
6. feedback is stored and available for later ranking improvements
7. removing the feature would mainly touch `background-agent/`, the host adapter, IPC wiring, and the panel registration files

## Risks And Mitigations

### Risk: the agent becomes tightly coupled to existing search code

Mitigation:

- reuse ideas and patterns, not search internals
- keep background-agent logic in its own folder and host adapter

### Risk: source quality is too weak for trustworthy suggestions

Mitigation:

- enforce source policy before synthesis
- enforce the evidence threshold before display

### Risk: the UI placement is right, but the feed is too noisy

Mitigation:

- keep refresh manual in v1
- cap feed size
- capture direct feedback signals immediately

### Risk: top-level folder isolation breaks the build or introduces awkward imports

Mitigation:

- update tsconfig early
- keep schemas in `background-agent/schemas/`
- block imports from app internals into the core

## Follow-On Phase

If Phase 1 proves useful, the next phase should add:

- scheduled digest generation
- richer feedback-aware reranking
- stronger architectural pattern detection
- better change-awareness from recent PRs and incidents
- more nuanced UI organization inside the ideas feed
