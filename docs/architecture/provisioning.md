---
description: The main-process host that discovers provisioners, spawns the CLI over stdin/stdout, streams JSON-line events, and turns a result into a real project.
covers: [src/main/provisioning]
updated: 2026-06-10
owner: see .github/CODEOWNERS
---

# Provisioning — the external-provisioner host

A *provisioner* is an external CLI executable that can list project templates, report
its health, and create a new repository on demand. This subsystem is the **main-process
host** side: it discovers the configured provisioners, spawns the executable, writes one
JSON request to its stdin, reads JSON-line events (`progress`/`result`/`error`) from its
stdout, and — for a `create` — clones the resulting repo into managed storage and
registers it as a Manifold project. The wire protocol and the contract for *authoring* a
provisioner live in [`docs/external-provisioners.md`](../external-provisioners.md); this
page documents the host that consumes it. Cloning and project registration themselves are
delegated to `src/main/store` and `gh`/`git`.

## Covered code

- `src/main/provisioning/provisioning-dispatcher.ts` — `ProvisioningDispatcher`, the façade exposing `listTemplates`, `getProvisionerStatuses`, `checkHealth`, and `create`.
- `src/main/provisioning/provisioner-process.ts` — `runProvisionerRequest()`: the CLI transport (spawn, write request to stdin, parse JSON lines from stdout).
- `src/main/provisioning/provisioner-command.ts` — `resolveProvisionerCommand()` (builtin vs. `cli`) and `fingerprintProvisioner()` (cache-key hash).
- `src/main/provisioning/provisioning-materializer.ts` — `materializeProvisionedProject()`: clone (`gh`→`git`/SSH→HTTPS) then `projectRegistry.addProject()`.
- `src/main/provisioning/provisioning-catalog-cache.ts` — `ProvisioningCatalogCache`: a 15-minute on-disk TTL cache of each provisioner's template catalog and last status.
- `src/main/provisioning/provisioning-health.ts` — `checkProvisionerHealth()`: a `health` request mapped to a `ProvisionerStatus`.
- `src/main/provisioning/provisioning-errors.ts` — `ProvisioningError` and `toProvisioningErrorDescriptor()`/`fromProvisionerErrorPayload()` conversions.
- `src/shared/provisioning-types.ts` — `PROVISIONER_PROTOCOL_VERSION` and every request/event/config/result/error type (shared with the renderer and provisioner authors).

Not detailed here: the renderer-side wizard UI, and `src/main/ipc/provisioning-handlers.ts` (covered under Interactions). The `__fixtures__/cli-provisioner-fixture.js` script is a test double that implements the same protocol.

## How it works

`ProvisioningDispatcher` is the only public entry point. It is constructed per call from a
`SettingsStore` and a `ProjectRegistry` (`provisioning-dispatcher.ts:67`) and holds no
long-lived state — the catalog cache is reconstructed on demand from
`<storagePath>/.cache/provisioning-catalog.json` (`provisioning-dispatcher.ts:283`).
`getEnabledProvisioners()` reads `settings.provisioning.provisioners`, drops any with
`enabled === false`, and optionally filters to one id (`provisioning-dispatcher.ts:252`).

**Resolve & spawn.** Every operation funnels through `runProvisioner()`
(`provisioning-dispatcher.ts:274`), which calls `resolveProvisionerCommand()` to get a
`{ command, args }` pair and then `runProvisionerRequest()`. A `cli` provisioner uses its
configured `command` + `args`; a `builtin` provisioner runs `process.execPath` against a
filename looked up in the `BUILTIN_PROVISIONERS` map (`provisioner-command.ts:9`). That map
is currently empty `{}` and `DEFAULT_SETTINGS.provisioning.provisioners` is `[]`
(`src/shared/defaults.ts:47`), so **no provisioner ships enabled by default today** — the
builtin path is scaffolding awaiting a bundled provisioner. `settings-store.ts:42` already
implements the auto-registration merge: it drops stale builtins not in the defaults and
re-adds any default builtins missing from the user's list, so a bundled provisioner becomes
available without the user editing settings.

**Transport.** `runProvisionerRequest()` (`provisioner-process.ts:26`) `spawn()`s the
command with `stdio: ['pipe','pipe','pipe']` and `ELECTRON_RUN_AS_NODE: '1'`, writes
`JSON.stringify(request)` to stdin and immediately `end()`s it (`provisioner-process.ts:163`).
Stdout is accumulated and split on `\n`; each complete line is trimmed, lines not starting
with `{` are skipped (so `gh`'s "Checking for update" chatter is ignored,
`provisioner-process.ts:103`), and the rest are `JSON.parse`d into a `ProvisionerEvent`.
Every event must carry the matching `protocolVersion` or the request rejects with
`protocol_error` (`provisioner-process.ts:62`). A `progress` event invokes the `onProgress`
callback; an `error` event rejects via `fromProvisionerErrorPayload`; a `result` event
resolves with `event.result` (`provisioner-process.ts:90`). A 60 s default timeout
(15 s for health, 10 min for `create` since scaffolding + pushing a repo can be slow —
`provisioning-dispatcher.ts:CREATE_TIMEOUT_MS`) `SIGTERM`s the child; spawn errors, non-zero
exits, and malformed JSON all reject with a typed `ProvisioningError`.

**List & cache.** `listTemplates()` (`provisioning-dispatcher.ts:73`) runs every enabled
provisioner in parallel via `loadProvisionerCatalog()`. If a non-stale cache entry exists
and `fresh` is false it returns the cached templates; otherwise it sends a `listTemplates`
request, writes the result to the cache with a fresh `fetchedAt`/`staleAt`, and returns
`source: 'live'`. On failure it falls back to the stale cache if present (marking the status
`degraded`/`unreachable`), else returns an empty catalog with the error
(`provisioning-dispatcher.ts:189`). Each template is decorated into a
`ProvisioningTemplateDescriptor` carrying a `qualifiedId` (provisioner id + template id, via
`encodeProvisioningTemplateQualifiedId`) so the renderer can later round-trip the selection.
The cache key is a SHA-1 `fingerprintProvisioner()` over the provisioner's id/type/label/
command/args/enabled (plus app version for builtins), so any config change invalidates the
entry (`provisioner-command.ts:35`, `provisioning-catalog-cache.ts:32`).

**Create.** `create()` (`provisioning-dispatcher.ts:106`) validates the request, splits the
`templateQualifiedId` back into provisioner + template ids, finds the (enabled) provisioner,
and sends a `create` request with a freshly minted `requestId`. The provisioner streams
`progress` events (forwarded to `onProgress` re-stamped with the `requestId` and qualified
id) and returns a `ProvisioningReadyResult` (`displayName`, `repoUrl`, `defaultBranch`,
optional `metadata`). The dispatcher then emits its own `cloning` progress and calls
`materializeProvisionedProject()` (`provisioning-dispatcher.ts:129`):
`materializeProvisionedProject()` slugifies the display name into a unique directory under
`<storagePath>/projects`, clones — preferring `gh repo clone` for GitHub repos, falling back
to `git clone` over SSH, then HTTPS (`provisioning-materializer.ts:65`) — and registers the
directory with `projectRegistry.addProject()`. On any failure it best-effort removes the
half-cloned directory and rethrows a typed error. Success returns a
`ProvisioningCreateResult` with the new project's `{ id, path, name, baseBranch }` and the
provisioner's `metadata`.

## Key types and entry points

- `ProvisioningDispatcher` — `provisioning-dispatcher.ts:67`. Public surface: `listTemplates(fresh?, provisionerId?)`, `getProvisionerStatuses()`, `checkHealth(provisionerId?)`, `create(request, onProgress?)`.
- `runProvisionerRequest<T>(command, args, request, onProgress?, options?)` — `provisioner-process.ts:26`. The generic CLI transport, shared by catalog, health, and create.
- `PROVISIONER_PROTOCOL_VERSION` (= `1`) — `provisioning-types.ts:1`. Asserted on every inbound event.
- `ProvisionerRequest` / `ProvisionerEvent<T>` — `provisioning-types.ts:149` / `:176`. The stdin request union (`listTemplates`/`create`/`health`) and the stdout event union (`progress`/`result`/`error`).
- `ProvisioningCreateRequest` / `ProvisioningCreateResult` / `ProvisioningOperationResult<T>` — `provisioning-types.ts:178` / `:183` / `:205`. The IPC-facing create shapes; `create()` always returns `{ ok }`, never throws.
- `ProvisionerConfig` / `ProvisionerStatus` / `ProvisioningTemplateDescriptor` — `provisioning-types.ts:19` / `:82` / `:98`. Settings entry, per-provisioner health/source summary, and a template enriched with its `qualifiedId`.
- `ProvisioningError` — `provisioning-errors.ts:11`. Carries a typed `descriptor` (`category`, `code`, `retryable`, `details`); `fromProvisionerErrorPayload()` re-hydrates an `error` event into one.

## Interactions

- **IPC** (`src/main/ipc/provisioning-handlers.ts`): registers `provisioning:list-templates`, `provisioning:refresh-templates` (forces `fresh`), `provisioning:get-statuses`, `provisioning:check-health`, and `provisioning:create`. Create progress is streamed back to the renderer over `provisioning:progress`, guarded by `sender.isDestroyed()` so a window destroyed mid-provision can't crash the main process (`provisioning-handlers.ts:56`). A `draftProvisioners` argument lets the settings UI evaluate not-yet-saved provisioner configs by swapping in a synthetic `SettingsStore` (`provisioning-handlers.ts:11`).
- **Settings** (`src/main/store/settings-store.ts`): owns `settings.provisioning.provisioners`, the builtin auto-registration merge (`:42`), and the `storagePath` that anchors both the projects directory and the catalog cache.
- **Store / projects** (`src/main/store/project-registry.ts`): `addProject()` (`:79`) is what turns a freshly cloned directory into a `Project` (resolving its `baseBranch`); it is the boundary where provisioning hands off to the rest of the app.
- **External tools**: `gh` and `git` (via `node:child_process`) perform the clone; the provisioner executable itself is any program that speaks the protocol.

## Invariants & gotchas

- **No provisioner is bundled or enabled by default today.** `BUILTIN_PROVISIONERS` is `{}` and the default provisioner list is empty; the builtin spawn path and the settings merge are present but dormant until a bundled provisioner lands (`provisioner-command.ts:7`, `src/shared/defaults.ts:47`).
- **One request, one response per spawn.** Each operation spawns a fresh process, writes a single request, and closes stdin. Stdout is parsed line-by-line as discrete JSON events; the first `result` or `error` settles the promise — later output is ignored.
- **Non-`{` lines are silently dropped.** This tolerates CLI banner noise (e.g. `gh` update checks) but means a provisioner that prints unprefixed diagnostics to stdout will have them swallowed; stderr is captured separately and only surfaced on a non-zero exit (`provisioner-process.ts:155`).
- **Protocol-version mismatch is fatal.** Any event whose `protocolVersion !== 1` rejects the whole request with `protocol_error`, even mid-stream after valid progress events.
- **`create()` never throws.** It always resolves to `ProvisioningOperationResult` — `{ ok: true, value }` or `{ ok: false, error }` — so the IPC layer can forward a typed descriptor instead of an exception (`provisioning-dispatcher.ts:141`).
- **The cache is fingerprint-keyed.** Editing a provisioner's command/args/label/enabled (or, for builtins, an app-version bump) changes its fingerprint and invalidates its cached catalog; the old entry is treated as absent (`provisioning-catalog-cache.ts:32`).
- **Failed materialization cleans up after itself.** A clone or registration failure best-effort `rmSync`s the partial project directory before rethrowing, so a retry starts from a clean slug (`provisioning-materializer.ts:114`).
