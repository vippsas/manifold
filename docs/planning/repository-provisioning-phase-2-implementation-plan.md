# Repository Provisioning Phase 2 Implementation Plan

Status: Draft
Date: 2026-03-23
Depends on:
- `docs/planning/repository-provisioning-dispatcher-plan.md`
- `docs/planning/repository-provisioning-implementation-plan.md`

## Purpose

This document turns the Phase 2 section of the repository provisioning roadmap into an execution plan.

Phase 1 established the end-to-end provisioning path for Simple view. Phase 2 should make that system operationally strong enough for regular use with multiple provisioners, while still staying inside the original architecture boundaries:

- one dispatcher in core
- external CLI-based provisioners
- templates as first-class catalog items
- final repositories materialized inside Manifold-managed storage

## Current Baseline

Phase 1 is implemented. The current system already provides:

- bundled provisioner support (OSS and additional bundled provisioners)
- support for configured standalone CLI provisioners
- template listing and manual refresh in Simple view
- template selection with generic schema-driven inputs
- create progress streaming
- managed-storage materialization and project registration
- automated coverage for the dispatcher, process runner, bundled provisioner, and Simple view flow

Current gaps relevant to Phase 2:

- multiple provisioners (bundled and standalone) work technically, but not yet as a fully managed product feature
- there is no dedicated settings UI for adding, editing, enabling, or testing standalone provisioners
- template catalogs are fetched live on demand, without durable cache management
- health checks exist in the protocol but are not surfaced in the product
- progress and error handling are still mostly string-based
- schema-driven rendering is intentionally minimal
- the legacy `projects:create-new` compatibility path still exists

## Phase 2 Goals

- Make multiple provisioners (bundled and standalone) a first-class supported configuration.
- Add provisioner health checks and template catalog caching.
- Improve progress and error semantics without breaking the Phase 1 flow.
- Improve schema-driven form rendering while keeping provisioner-specific custom UI out of scope.
- Add a settings experience for configuring and validating standalone provisioners.
- Decide whether the legacy `projects:create-new` path can be retired or reduced further.

## Phase 2 Non-Goals

- Developer view onboarding integration
- remote OSS repository creation
- arbitrary final `localPath` outside managed storage
- provisioner-specific custom renderer components
- template search, favorites, or policy filtering
- company-specific provisioning logic in this repository

## Phase 2 Deliverables

- additive protocol extensions for health, richer progress, and structured errors
- dispatcher support for cache-backed catalog aggregation and health-aware behavior
- persistent template catalog cache and refresh semantics
- provisioner health visibility and test actions in settings
- settings UI for multiple standalone CLI provisioners
- improved generic schema-driven form rendering in Simple view
- documented and enforced decision on the legacy `projects:create-new` path
- automated coverage for the new cache, health, and settings flows

## Phase 2 Principles

- Prefer additive changes to protocol v1 over a breaking version bump unless forced.
- Keep the dispatcher generic. Health, caching, and diagnostics must remain provisioner-agnostic.
- Preserve the current Simple view creation flow shape. Phase 2 should harden it, not redesign it.
- Keep auth and secrets outside Manifold wherever possible.
- Allow degraded operation. One failing provisioner must not make the whole catalog unusable.

## Workstreams

### 1. Protocol Evolution

Phase 2 should tighten the contract without breaking existing Phase 1 provisioners if possible.

Recommended additions:

- extend `health` results with optional metadata:
  - `healthy`
  - `summary`
  - `checkedAt`
  - `version`
  - `capabilities`
- extend progress events with optional machine-readable fields:
  - `stage`
  - `status`
  - `percent`
  - `retryable`
- define a structured error shape for dispatcher-to-renderer and provisioner-to-dispatcher failures:
  - `code`
  - `category`
  - `message`
  - `retryable`
  - `details`

Recommended error categories:

- `provisioner_unavailable`
- `protocol_error`
- `health_check_failed`
- `template_catalog_failed`
- `template_not_found`
- `create_failed`
- `clone_failed`
- `registration_failed`
- `settings_invalid`

Implementation notes:

- keep `PROVISIONER_PROTOCOL_VERSION = 1` if all new fields are optional
- only introduce protocol v2 if a breaking transport or payload change is required

Candidate files:

- `src/shared/provisioning-types.ts`
- `src/main/provisioning/provisioning-errors.ts`
- `src/main/provisioning/provisioner-process.ts`

### 2. Dispatcher Hardening

Phase 2 should make the dispatcher resilient when multiple provisioners are configured and only some of them are healthy.

Tasks:

- add per-provisioner timeouts for `listTemplates`, `create`, and `health`
- treat `health` as advisory, not blocking, for template discovery unless explicitly configured otherwise
- preserve degraded catalog behavior when one provisioner fails
- centralize error mapping so renderer-facing failures are consistent
- improve logging around:
  - provisioner launch failures
  - malformed protocol responses
  - cache hits and stale cache fallback
  - clone or registration failures

Recommended behavior:

- cached templates may still be shown for an unhealthy provisioner, but marked stale
- `create` should fail fast if the selected provisioner is unavailable and no cached metadata is sufficient
- provisioner command resolution errors should be surfaced with actionable messages

Candidate files:

- `src/main/provisioning/provisioning-dispatcher.ts`
- `src/main/provisioning/provisioner-process.ts`
- `src/main/ipc/provisioning-handlers.ts`

### 3. Template Catalog Caching

Phase 2 should add a persistent cache for template catalogs so startup and repeated dialog opens do not depend entirely on live provisioner responses.

Cache requirements:

- cache per provisioner, not one monolithic catalog blob
- persist cache under Manifold-managed app data
- store:
  - templates
  - `fetchedAt`
  - `staleAt`
  - last known health summary
  - command fingerprint or provisioner config fingerprint
- invalidate cache when:
  - the provisioner command or args change
  - the provisioner id changes
  - the user manually refreshes

Recommended Phase 2 behavior:

- `listTemplates` returns cached results immediately when available
- dispatcher refreshes stale entries in the background or on explicit demand
- `provisioning:refresh-templates` bypasses cache and updates stored entries
- if live refresh fails but cached data exists, return cached data with stale metadata instead of dropping the provisioner entirely

Candidate files:

- `src/main/provisioning/provisioning-catalog-cache.ts`
- `src/main/provisioning/provisioning-dispatcher.ts`
- `src/main/store/settings-store.ts`

### 4. Health Checks

Phase 2 should make provisioner health a visible and testable product concept.

Tasks:

- add dispatcher support for `checkHealth(provisionerId?)`
- run health checks from settings on demand
- decide whether startup should opportunistically refresh health state
- expose last health status and last checked time to the renderer

Recommended health states:

- `healthy`
- `degraded`
- `unreachable`
- `misconfigured`
- `unknown`

Health should answer:

- is the executable launchable?
- does it respond with valid protocol?
- does it claim to support the expected operations?
- what is the latest user-facing summary?

Candidate files:

- `src/main/provisioning/provisioning-health.ts`
- `src/main/ipc/provisioning-handlers.ts`
- `src/shared/provisioning-types.ts`

### 5. Settings UX For Provisioners

Phase 2 should eliminate manual config editing as the primary way to add org provisioners.

Tasks:

- add a new `Provisioning` tab in the settings modal
- list all configured provisioners with:
  - label
  - id
  - type
  - enabled/disabled state
  - command and args for CLI provisioners
  - health summary
  - last refresh timestamp
- allow:
  - add external CLI provisioner
  - edit label, command, args, enabled state
  - remove external CLI provisioner
  - reorder provisioners if UI ordering matters
  - run health check / test connection
  - refresh that provisioner’s catalog

Validation rules:

- ids must be unique
- command is required for `type: "cli"`
- bundled provisioner id cannot be deleted
- invalid configurations should be blocked before save

Recommended UX:

- keep bundled OSS provisioner visible and editable only where safe
- avoid exposing raw JSON editing in the primary flow
- show actionable validation messages inline

Candidate files:

- `src/renderer/components/modals/SettingsModal.tsx`
- `src/renderer/components/modals/settings/SettingsModalBody.tsx`
- `src/renderer/components/modals/settings/ProvisioningSettingsSection.tsx`
- `src/shared/types.ts`
- `src/shared/defaults.ts`

### 6. Simple View UX Refinement

Phase 2 should improve the existing Simple view flow without changing its core steps.

Tasks:

- show stale/cached state when templates are loaded from cache
- surface provisioner health issues without hiding healthy templates from other provisioners
- improve error presentation for:
  - unavailable provisioner
  - invalid template response
  - clone failure
  - registration failure
- support richer generic schema rendering for:
  - `string`
  - multiline string
  - `boolean`
  - `integer`
  - `number`
  - enum/select
  - default values
  - descriptions/help text
  - validation hints such as min/max/required

Still out of scope:

- provisioner-specific custom UI widgets
- search/favorites/policy filters

Candidate files:

- `src/renderer-simple/components/Dashboard.tsx`
- `src/renderer-simple/components/Dashboard.styles.ts`
- `src/preload/simple.ts`
- `src/shared/provisioning-types.ts`

### 7. Legacy Path Cleanup

Phase 2 should decide whether `projects:create-new` remains needed.

Tasks:

- identify all remaining callers of `projects:create-new`
- if Simple view is the only historical user, either:
  - retire the IPC completely, or
  - keep it as an internal compatibility wrapper with explicit deprecation notes
- document the decision in the main implementation plan

Recommendation:

- remove it from user-facing renderer surfaces where it is no longer used
- only keep it internally if another path still depends on it

Candidate files:

- `src/main/ipc/project-handlers.ts`
- `src/preload/index.ts`
- `src/preload/simple.ts`

### 8. Testing And Diagnostics

Phase 2 needs broader automated coverage because the main risks are now operational rather than architectural.

Main-process tests:

- health check success and failure
- cached catalog read/write/invalidation
- stale cache fallback when a provisioner is down
- multi-provisioner aggregation with mixed health states
- structured error mapping
- settings validation and migration behavior for multiple provisioners

Renderer tests:

- settings UI for add/edit/remove provisioner
- inline validation for invalid provisioner config
- health check action and result display
- cached/stale template state in Simple view
- richer schema field rendering and validation
- improved error UX during create

Manual verification:

- bundled OSS only
- bundled OSS plus one external provisioner
- bundled OSS plus two external provisioners
- one healthy and one failing provisioner
- slow provisioner with cached fallback

## Detailed Task Breakdown

### Milestone A: Protocol And Dispatcher Hardening

1. Introduce structured error and health types.
2. Add a dispatcher-facing error mapping layer.
3. Add `health` execution path in main.
4. Add per-operation timeouts and consistent logging.
5. Add tests for mixed healthy/unhealthy provisioners.

### Milestone B: Catalog Cache

1. Add persistent cache storage for per-provisioner template catalogs.
2. Add cache fingerprinting against provisioner config.
3. Add stale-state handling and manual invalidation.
4. Update template IPCs to return cache metadata.
5. Add dispatcher tests for cache hit, refresh, and stale fallback.

### Milestone C: Settings UX

1. Add `Provisioning` settings tab.
2. Add external provisioner add/edit/remove flows.
3. Add save-time validation and migration handling.
4. Add per-provisioner health check and refresh actions.
5. Add renderer tests for the settings tab.

### Milestone D: Simple View UX Refinement

1. Show stale/cached template state.
2. Surface structured progress stages and user-facing error states.
3. Expand generic schema rendering to the supported Phase 2 subset.
4. Add renderer tests for the richer schema and error states.

### Milestone E: Cleanup And Release Readiness

1. Decide and implement the `projects:create-new` compatibility outcome.
2. Update implementation tracking docs.
3. Run full verification across provisioning and settings flows.

## Acceptance Criteria

Phase 2 is complete when all of the following are true:

- multiple external CLI provisioners can be configured in-product through settings
- provisioner health can be checked and surfaced per provisioner
- template catalogs use persistent cache with stale fallback behavior
- manual refresh invalidates and updates provisioner catalog state
- Simple view can surface cached/stale template state
- richer generic schema rendering supports the Phase 2 field subset
- failures are surfaced through structured categories instead of ad hoc strings alone
- one failing provisioner does not block healthy provisioners or cached templates from other sources
- the legacy `projects:create-new` decision is implemented and documented
- automated coverage exists for health, cache behavior, multi-provisioner settings, and richer renderer flows

## Recommended File Additions

- `src/main/provisioning/provisioning-catalog-cache.ts`
- `src/main/provisioning/provisioning-health.ts`
- `src/main/provisioning/provisioning-errors.ts`
- `src/renderer/components/modals/settings/ProvisioningSettingsSection.tsx`
- `src/renderer/components/modals/settings/ProvisioningSettingsSection.test.tsx`

## Risks

- cache invalidation bugs may show stale or wrong templates
- settings UX can become too complex if provider configuration is too open-ended
- additive protocol changes may still expose compatibility gaps with early external provisioners
- richer schema rendering can drift toward custom-form complexity
- health checks can become noisy if timeouts and degraded states are not designed well

## Risk Mitigations

- fingerprint cache entries by provisioner config
- keep the supported schema field subset explicit in Phase 2
- make health checks on-demand first, then add background refresh only if clearly needed
- use structured errors with stable codes before expanding UI complexity
- validate against the external fixture provisioner and at least one real org provisioner

## Out-Of-Scope Follow-On Work

These should stay in Phase 3 or later unless Phase 2 uncovers a hard dependency:

- Developer view onboarding reuse
- template search and favorites
- org-level template defaults or policy filtering
- provisioner diagnostics beyond what is required for health and configuration
- remote OSS repository creation
