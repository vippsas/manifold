# Repository Provisioning Implementation Plan

Status: Phase 1 Implemented
Date: 2026-03-23
Depends on: `docs/planning/repository-provisioning-dispatcher-plan.md`

## Purpose

This document turns the repository provisioning architecture into an execution plan.

It covers the full initiative, but the implementation detail is intentionally concentrated in Phase 1. Later phases are included so sequencing and dependencies are visible, but they should remain lighter until the first delivery is complete and validated.

## Implementation Status

Phase 1 status: Implemented

Completed in code:

- versioned provisioning protocol and shared types
- settings support for bundled and standalone CLI provisioners
- main-process dispatcher, CLI runner, and managed-storage materialization flow
- bundled OSS provisioner CLI shipped from this repo
- standalone CLI provisioner support validated with automated fixture coverage
- Simple view template picker, refresh flow, generic schema-driven inputs, and create-progress UX
- project registration plus existing simple-mode agent startup on the provisioned repository
- provisioning-specific automated coverage for dispatcher, process runner, bundled OSS provisioner, and Simple view template flow

Deferred to later phases:

- Developer view onboarding integration
- remote OSS repository creation
- provisioner-specific custom renderer components
- richer settings UX for configuring standalone provisioners
- broader catalog features such as search, favorites, and policy filters

Verification:

- `npm run typecheck` passes
- `npm test` passes
- provisioning-specific coverage is included for:
  - `src/main/provisioning/provisioner-process.test.ts`
  - `src/main/provisioning/provisioning-dispatcher.test.ts`
  - `src/renderer-simple/components/Dashboard.test.tsx`

## Scope

Initial delivery scope:

- implement the new provisioning model for Simple view
- support both the bundled OSS provisioner and at least one external org provisioner
- keep one shared creation flow in Manifold
- materialize final app repositories inside Manifold-managed storage

Out of scope for the initial delivery:

- Developer view onboarding integration
- remote OSS repo creation
- arbitrary final `localPath` outside managed storage
- provisioner-specific custom forms beyond generic schema-driven inputs
- advanced template discovery features such as favorites or policy filtering

## Invariants From The Architecture Doc

These decisions should be treated as fixed for Phase 1:

- provisioners are external CLI executables speaking a versioned JSON protocol
- the initial OSS provisioner lives in this repo but is still invoked through the same CLI contract
- templates are first-class catalog items, separate from provisioners
- template catalog entries should show provisioner labels prominently
- templates may include app defaults and agent-oriented assets such as Codex/Copilot/Claude Code skills
- the final per-app repository must be a distinct checkout and must live inside Manifold-managed storage
- the product needs a way to refresh templates
- the initial work focuses on Simple view

## Delivery Strategy

The plan is split into workstreams so multiple parts can move independently, but the Phase 1 acceptance criteria are end-to-end:

1. Manifold can discover templates from the bundled OSS provisioner and at least one external CLI provisioner.
2. Simple view can show the merged template catalog, including provisioner labels.
3. A user can create a new app from a selected template.
4. Manifold receives repository details from the provisioner and materializes the final checkout into managed storage.
5. The created project is registered and the non-interactive agent starts as it does today.
6. Template refresh and progress/error reporting work for the initial experience.

## Proposed Phase Structure

### Phase 1

Build the minimum end-to-end provisioning system for Simple view.

### Phase 2

Expand robustness and flexibility after the basic flow is proven.

### Phase 3

Add usability, diagnostics, and broader reuse once the provisioning core is stable.

## Workstreams

### 1. Shared Types And Protocol

Own the versioned protocol and shared TypeScript types used by main, preload, renderer, and tests.

### 2. Main-Process Provisioning Core

Own process execution, template aggregation, create orchestration, local materialization, and project registration.

### 3. Settings And Provisioner Configuration

Own settings schema changes, defaults, validation, and persisted provisioner configuration.

### 4. Bundled OSS Provisioner

Own the built-in OSS implementation, template catalog, packaging shape, and bootstrap behavior.

### 5. Simple View UI And IPC

Own template listing, refresh, create flow, progress UX, and renderer integration.

### 6. Testing And Diagnostics

Own unit coverage, integration-style coverage, fixture provisioners, and operator-visible error handling.

## Candidate File Layout

This is a proposed starting structure, not a locked design:

- `src/shared/provisioning-types.ts`
- `src/main/provisioning/provisioning-dispatcher.ts`
- `src/main/provisioning/provisioner-process.ts`
- `src/main/provisioning/provisioning-materializer.ts`
- `src/main/provisioning/provisioning-errors.ts`
- `src/main/ipc/provisioning-handlers.ts`
- `src/main/ipc/project-handlers.ts`
- `src/main/store/settings-store.ts`
- `src/shared/types.ts`
- `src/shared/defaults.ts`
- `src/preload/simple.ts`
- `src/renderer-simple/hooks/useTemplates.ts`
- `src/renderer-simple/components/TemplatePicker.tsx`
- `src/renderer-simple/components/CreateAppFlow.tsx`
- `src/provisioners/oss/` for the bundled OSS CLI implementation

If packaging constraints make `src/provisioners/oss/` awkward, the exact location can change. The important constraint is that it remains a bundled CLI implementation, not an in-process special case.

## Dependency Map

Critical dependencies for Phase 1:

- shared protocol types before renderer and main IPC can stabilize
- settings shape before dispatcher wiring can be considered done
- dispatcher before the Simple view create flow can be switched
- bundled OSS provisioner before the new flow can be tested end to end
- template refresh behavior before the Simple view UX can be considered complete

Suggested build order:

1. Shared protocol and settings types
2. Main-process dispatcher and materialization path
3. Bundled OSS provisioner
4. Fixture external provisioner for testing
5. Simple view UI and IPC changes
6. Hardening, tests, and diagnostics

## Phase 1 Detailed Plan

### Phase 1 Goal

Replace the current hardcoded local repo creation flow with a dispatcher-based template provisioning flow in Simple view, while preserving the existing downstream behavior of project registration and agent startup.

### Phase 1 Non-Goals

- Developer view onboarding template support
- remote OSS repo creation
- arbitrary external local checkout ownership
- custom renderer components for provisioner-specific forms
- advanced catalog features such as favorites or policy filters

### Phase 1 Deliverables

- versioned protocol v1
- provisioner configuration in settings
- dispatcher service in main
- bundled OSS CLI provisioner in this repo
- support for at least one configured external CLI provisioner
- merged template catalog in Simple view
- create flow with progress and error states
- refresh templates mechanism
- unit and integration-style test coverage for the new path

### Phase 1 Workstream Tasks

#### 1. Shared Types And Protocol

Create a single shared protocol definition.

Tasks:

- add `src/shared/provisioning-types.ts`
- define protocol version constant
- define request/response types for:
  - `listTemplates`
  - `create`
  - `health`
- define progress event shape for long-running create operations
- define template descriptor shape, including:
  - namespaced template identity
  - title
  - description
  - category
  - provisioner label/id
  - tags
  - input schema
- define create result shape for Phase 1
- define structured error shape

Phase 1 protocol constraints:

- `create` should return repository metadata and `repoUrl`
- the result should not rely on arbitrary final `localPath`
- progress messages should be plain text plus machine-readable status where useful

Recommended result shape for Phase 1:

```ts
interface ProvisioningReadyResult {
  displayName: string
  repoUrl: string
  defaultBranch: string
  metadata?: Record<string, string>
}
```

#### 2. Settings And Provisioner Configuration

Extend settings so Manifold can discover and run provisioners.

Tasks:

- extend `ManifoldSettings` in `src/shared/types.ts`
- add defaults in `src/shared/defaults.ts`
- update `SettingsStore` migration/defaulting logic in `src/main/store/settings-store.ts`
- define bundled OSS provisioner as enabled by default
- define external provisioner configuration shape, for example:
  - `id`
  - `label`
  - `type: "builtin" | "cli"`
  - `enabled`
  - `command`
  - `args`

Phase 1 behavior:

- the bundled OSS provisioner is always available unless explicitly disabled
- external CLI provisioners are optional, settings-driven, and trusted by local configuration
- no secret management is added to Manifold

#### 3. Main-Process Provisioning Core

Introduce a dispatcher and materialization path in the main process.

Tasks:

- add a dispatcher service under `src/main/provisioning/`
- add a process runner for CLI provisioners
- implement template aggregation across enabled provisioners
- implement create orchestration for a selected provisioner/template
- materialize the final repository into `settings.storagePath/projects/...`
- register the created project using the existing `ProjectRegistry`
- keep downstream agent spawn behavior unchanged

Concrete refactors:

- move the local create-new logic out of `src/main/ipc/project-handlers.ts`
- keep `projects:create-new` as a compatibility wrapper only if needed
- prefer new provisioning-specific IPCs for the template flow

Recommended Phase 1 IPC additions:

- `provisioning:list-templates`
- `provisioning:refresh-templates`
- `provisioning:create`

Recommended create flow in main:

1. receive template selection and input values
2. call dispatcher `create`
3. stream progress back to renderer
4. clone `repoUrl` into managed storage
5. add project to registry
6. return created project details to the renderer

Repository materialization rules for Phase 1:

- final project directory lives under `settings.storagePath/projects`
- directory name is derived from returned display name with collision handling
- clone failure must not leave a partially registered project
- partial directories should be cleaned up on failure where safe

#### 4. Bundled OSS CLI Provisioner

Implement the first bundled provisioner in this repo, but behind the same protocol boundary.

Tasks:

- create bundled OSS provisioner entrypoint
- implement `listTemplates`
- implement `health`
- implement `create`
- define the initial template catalog for OSS use
- choose the template bootstrap mechanism for Phase 1
- ensure every create produces a distinct repo source for the final app

Phase 1 recommendation:

- bootstrap from pinned template references
- use `git`-based materialization for template source fetch/copy
- keep remote OSS repo creation out of scope

Important OSS provisioner requirements:

- template definitions should be versioned in this repo
- templates may include starter app files and agent-oriented assets
- the provisioner may reuse a cached template source internally
- the provisioner must not hand the same mutable checkout to multiple apps

#### 5. External CLI Provisioner Support

Prove the extension model in Phase 1.

Tasks:

- ensure dispatcher can invoke at least one configured external CLI provisioner
- handle missing executable, non-zero exit, malformed JSON, and timeout cases
- ensure one failing provisioner does not break the whole template catalog
- expose enough metadata in errors to debug provisioner issues

Phase 1 recommendation:

- create a fixture/mock external CLI provisioner for automated tests
- validate the real company provisioner against the same protocol separately

#### 6. Simple View UI And IPC

Replace the current “name + description only” create path with a template-first flow.

Current seam:

- `src/renderer-simple/App.tsx` currently calls `projects:create-new` directly from `onStart`
- `src/preload/simple.ts` currently exposes `projects:create-new` but no provisioning-specific APIs

Tasks:

- add new preload-safe IPC channels for provisioning
- fetch template catalog on entry to the create flow
- show template cards or list with:
  - title
  - description
  - category
  - prominent provisioner label
- allow the user to refresh the template catalog
- render generic form fields from schema for the selected template
- start create and show provisioning progress
- surface structured errors cleanly
- once the project is created, continue into the existing agent-start flow

Phase 1 UX expectations:

- Simple view remains one creation flow
- users choose templates, not provisioners, as the primary action
- provisioner labels remain visible so OSS and company sources are clear
- progress is visible during long-running remote provisioning

#### 7. Agent Startup Integration

Preserve the current app-builder behavior once provisioning succeeds.

Tasks:

- keep `buildSimplePrompt(...)` and current simple runtime behavior unchanged where possible
- continue spawning a non-interactive session on the newly created project
- ensure the created project path is passed through exactly as the current flow expects
- preserve app dashboard behavior for reopening and deleting apps

The goal is to change how the repository is provisioned, not to redesign the post-create chat/build loop in Phase 1.

#### 8. Refresh Behavior

Template refresh is required in Phase 1.

Tasks:

- decide whether refresh is manual button only, auto-on-open plus manual, or cached with explicit invalidate
- implement refresh IPC and dispatcher behavior
- avoid blocking the UI longer than necessary when one provisioner is slow or failing
- define stale-state UX for the template catalog

Phase 1 recommendation:

- load cached or in-memory template state on entry if available
- provide an explicit refresh control
- refresh all enabled provisioners on demand

#### 9. Testing And Diagnostics

Add coverage for the new architecture before removing confidence from the current create flow.

Main-process test targets:

- protocol parsing and validation
- provisioner process execution
- template aggregation across multiple provisioners
- resilience when one provisioner fails
- create success path
- create failure cleanup
- clone collision handling

Renderer/preload test targets:

- template loading state
- refresh action
- template selection
- schema-driven input rendering
- progress state
- error state

Fixture strategy:

- one bundled OSS fixture
- one external CLI fixture
- one malformed provisioner fixture
- one slow provisioner fixture

#### 10. Migration And Compatibility

Manage the transition away from the current `projects:create-new` behavior.

Tasks:

- decide whether `projects:create-new` stays as a compatibility alias or becomes internal-only
- update Simple view to use provisioning IPCs
- ensure existing Simple view apps still reopen normally
- document any settings migration needed for provisioners

Phase 1 recommendation:

- keep `projects:create-new` available temporarily if another caller still depends on it
- switch Simple view to the new provisioning path immediately once the new path is ready

### Phase 1 Exit Criteria

Phase 1 is complete when all of the following are true:

- [x] Simple view can list templates from bundled OSS plus at least one external CLI provisioner. Evidence: [provisioning-dispatcher.ts](../../src/main/provisioning/provisioning-dispatcher.ts), [provisioning-dispatcher.test.ts](../../src/main/provisioning/provisioning-dispatcher.test.ts).
- [x] Template labels clearly show which provisioner each template comes from. Evidence: [Dashboard.tsx](../../src/renderer-simple/components/Dashboard.tsx).
- [x] A user can refresh templates. Evidence: [Dashboard.tsx](../../src/renderer-simple/components/Dashboard.tsx), [Dashboard.test.tsx](../../src/renderer-simple/components/Dashboard.test.tsx).
- [x] A user can create an app from a selected template. Evidence: [Dashboard.tsx](../../src/renderer-simple/components/Dashboard.tsx), [App.tsx](../../src/renderer-simple/App.tsx).
- [x] Provisioning progress is shown during create. Evidence: [provisioning-handlers.ts](../../src/main/ipc/provisioning-handlers.ts), [Dashboard.tsx](../../src/renderer-simple/components/Dashboard.tsx).
- [x] The created repo is cloned into Manifold-managed storage. Evidence: [provisioning-dispatcher.ts](../../src/main/provisioning/provisioning-dispatcher.ts), [provisioning-dispatcher.test.ts](../../src/main/provisioning/provisioning-dispatcher.test.ts).
- [x] The project is registered and the agent starts successfully. Evidence: [provisioning-dispatcher.ts](../../src/main/provisioning/provisioning-dispatcher.ts), [App.tsx](../../src/renderer-simple/App.tsx), [simple-prompts.ts](../../src/shared/simple-prompts.ts).
- [x] Failure cases do not leave partially registered projects behind. Evidence: [provisioning-dispatcher.ts](../../src/main/provisioning/provisioning-dispatcher.ts), [provisioning-dispatcher.test.ts](../../src/main/provisioning/provisioning-dispatcher.test.ts).
- [x] Automated coverage exists for the core dispatcher and create flow. Evidence: [provisioner-process.test.ts](../../src/main/provisioning/provisioner-process.test.ts), [provisioning-dispatcher.test.ts](../../src/main/provisioning/provisioning-dispatcher.test.ts), [Dashboard.test.tsx](../../src/renderer-simple/components/Dashboard.test.tsx).

Verification completed on 2026-03-23:

- [x] `npm run typecheck`
- [x] `npm test`

## Phase 2 Planned Work

Phase 2 should harden and broaden the system after the first delivery is working.

Detailed Phase 2 execution planning lives in:

- `docs/planning/repository-provisioning-phase-2-implementation-plan.md`

Planned items:

- support multiple external provisioners as a first-class common case
- add health checks and cached template catalogs
- add richer progress state and structured error categories
- improve schema-driven form rendering
- revisit whether `projects:create-new` can be retired completely
- improve settings UX for provisioner configuration

Phase 2 should also validate whether the protocol needs extensions before wider reuse in Developer onboarding.

## Phase 3 Planned Work

Phase 3 should focus on usability, diagnostics, and broader product reuse.

Planned items:

- provisioner diagnostics in settings
- template search, favorites, and org defaults
- policy-aware template visibility
- Developer view onboarding reuse
- optional future support for remote OSS repo creation

## Risks

- protocol churn before the company provisioner stabilizes
- packaging friction for the bundled OSS CLI
- complexity in schema-driven forms if templates diverge too much
- ambiguous error handling when remote repo creation succeeds but local clone fails
- renderer complexity if progress and retry states are underdesigned

## Risk Mitigations

- keep protocol v1 intentionally small
- validate with a fixture external provisioner early
- keep Phase 1 template forms generic and limited
- centralize cleanup behavior in the materialization path
- keep the first UI flow narrow and observable

## Open Implementation Questions

- What is the exact build/package strategy for the bundled OSS CLI inside the Electron app?
- Should `provisioning:create` be a long-running invoke with progress events on a side channel, or a start/subscribe/cancel model?
- How should template input schema map to concrete renderer components in Phase 1?
- Should template refresh always bypass cache, or should it revalidate cached results per provisioner?
- Do we want retry actions in the initial error UX, or just fail-and-return to template selection?

## Next Planned Step

Use this document as the roadmap for Phase 2 and later work.

The next concrete planning artifact should be a Phase 2 task breakdown derived from the planned work and deferred items above.
