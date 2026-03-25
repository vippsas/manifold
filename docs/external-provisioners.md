# External Provisioners

Status: Current
Date: 2026-03-23

## Purpose

This document describes how to build an external repository provisioner for Manifold.

Use it when building:

- a bundled provisioner shipped with Manifold (lives in this repo, uses the same CLI protocol)
- a private org provisioner (separate repo/project)
- a local test provisioner

The canonical runtime contract lives in:

- `src/shared/provisioning-types.ts`

This document should match that code.

## Before You Start

An external provisioner is a CLI executable that speaks the provisioning JSON protocol over `stdin`/`stdout`. It can live in one of two places:

- **Bundled** — inside this repo under `provisioners/`. Shipped with Manifold and auto-registered at build time. Uses TypeScript and follows the same build pipeline as the rest of the app.
- **Standalone** — a separate repo or project directory with no code dependency on Manifold. Registered manually in Manifold settings.

Both kinds use the exact same protocol. The only difference is where the code lives and how the provisioner is registered.

### Choose a Language

For **bundled** provisioners, use TypeScript (consistent with the rest of the codebase).

For **standalone** provisioners, any language that can read JSON from `stdin` and write JSON lines to `stdout` works: Node.js/TypeScript, Python, Go, Bash, etc.

### Decide What Your Provisioner Creates

Before writing code, know the answers to:

- What kind of repositories will it create? (GitHub template repos, Cookiecutter scaffolds, org-specific templates, etc.)
- What templates will it offer via `listTemplates`?
- Does it need authentication to an external service (GitHub API, Backstage, etc.)?

### Have Ready

- Authentication for any service your provisioner calls. If the user already has a CLI tool authenticated locally (e.g., `gh` for GitHub, `glab` for GitLab), the provisioner can shell out to it directly — no extra tokens needed. Otherwise, keep credentials inside the provisioner's own configuration — Manifold does not manage provisioner secrets.
- A unique `id` for your provisioner (e.g., `company-backstage`).
- A human-readable `label` (e.g., `Company Templates`).

### Operations to Implement

| Operation | What it does |
|---|---|
| `listTemplates` | Return available repo templates |
| `create` | Create a repo from a template and return its `repoUrl` |
| `health` | Report whether the provisioner is functional |

### Register in Manifold

- **Bundled provisioners** are auto-registered by the dispatcher at startup. No manual settings entry needed — just add the provisioner module under `src/main/provisioning/` and wire it into the dispatcher.
- **Standalone provisioners** must be registered in Manifold settings (see [Settings Example](#settings-example) below).

## Provisioner Model

An external provisioner is a local CLI executable.

Manifold:

- starts the executable
- writes one JSON request to `stdin`
- reads JSON lines from `stdout`
- treats `stderr` as diagnostics only

The provisioner:

- handles one request per process invocation
- emits zero or more `progress` events
- emits exactly one terminal `result` or `error` event
- exits once the request is complete

## Supported Operations

- `listTemplates`
- `create`
- `health`

## Transport Rules

- Read the full request JSON from `stdin`.
- Write one JSON object per line to `stdout`.
- Use `event`, not `status`, to distinguish message types.
- Do not print non-JSON content to `stdout`.
- If you need logging, write to `stderr`.

## Request Shapes

### `listTemplates`

```json
{
  "protocolVersion": 1,
  "operation": "listTemplates",
  "requestId": "req_123",
  "fresh": true
}
```

Notes:

- `fresh` is optional.
- Manifold uses `fresh: true` when the user explicitly refreshes templates.

### `health`

```json
{
  "protocolVersion": 1,
  "operation": "health",
  "requestId": "req_123"
}
```

### `create`

```json
{
  "protocolVersion": 1,
  "operation": "create",
  "requestId": "req_123",
  "templateId": "company-service",
  "inputs": {
    "name": "ledger-service",
    "description": "Track company ledger entries."
  }
}
```

Notes:

- `templateId` is scoped to the provisioner.
- Manifold namespaces it internally as `provisionerId:templateId`.

## Event Shapes

### `progress`

```json
{
  "protocolVersion": 1,
  "requestId": "req_123",
  "event": "progress",
  "message": "Waiting for repository workflow to finish",
  "stage": "provisioning",
  "status": "running",
  "percent": 35,
  "retryable": false
}
```

Fields:

- `message` is required
- `stage`, `status`, `percent`, and `retryable` are optional

Allowed `stage` values:

- `provisioning`
- `cloning`
- `registering`
- `ready`

Allowed `status` values:

- `running`
- `waiting`
- `done`
- `error`

### `result`

```json
{
  "protocolVersion": 1,
  "requestId": "req_123",
  "event": "result",
  "result": {
    "displayName": "ledger-service",
    "repoUrl": "git@github.com:acme/ledger-service.git",
    "defaultBranch": "main",
    "metadata": {
      "providerProjectUrl": "https://backstage.example.com/catalog/default/component/ledger-service"
    }
  }
}
```

### `error`

```json
{
  "protocolVersion": 1,
  "requestId": "req_123",
  "event": "error",
  "error": {
    "message": "Backstage template execution failed",
    "code": "backstage_template_failed",
    "category": "create_failed",
    "retryable": true,
    "details": {
      "template": "company-service"
    }
  }
}
```

## `listTemplates` Result Shape

The `result` payload for `listTemplates` is an array of templates:

```json
[
  {
    "id": "company-service",
    "title": "Company Service",
    "description": "Standard backend service",
    "category": "Backend",
    "tags": ["internal", "service"],
    "paramsSchema": {
      "type": "object",
      "properties": {
        "name": { "type": "string", "title": "Service name" },
        "description": { "type": "string", "title": "Description", "multiline": true }
      },
      "required": ["name", "description"]
    }
  }
]
```

Rules:

- `id` must be unique within the provisioner.
- Do not include `provisionerId` or `provisionerLabel`; Manifold adds those.
- `paramsSchema` should use the generic field subset implemented by Manifold.

Supported field types:

- `string`
- `boolean`
- `integer`
- `number`

- `title`
- `description`
- `default`
- `placeholder`
- `multiline`
- `enum`
- `minimum`
- `maximum`
- `step`

## `health` Result Shape

```json
{
  "healthy": true,
  "summary": "Authenticated and ready",
  "checkedAt": "2026-03-23T20:00:00.000Z",
  "version": "1.2.3",
  "capabilities": ["listTemplates", "create", "health"]
}
```

Only `healthy` is required.

## `create` Result Shape

```json
{
  "displayName": "ledger-service",
  "repoUrl": "git@github.com:acme/ledger-service.git",
  "defaultBranch": "main",
  "metadata": {
    "providerProjectUrl": "https://backstage.example.com/catalog/default/component/ledger-service"
  }
}
```

Rules:

- `displayName`, `repoUrl`, and `defaultBranch` are required.
- Do not return arbitrary final `localPath`.
- The repository behind `repoUrl` must be ready for Manifold to clone.
- Each create must correspond to a distinct app repository or distinct working source.

## Behavioral Requirements

- Validate `protocolVersion` and reject unsupported versions.
- Return one terminal `result` or `error` event.
- Emit `progress` only when it adds value.
- Keep auth and secrets inside the provisioner, not in Manifold. Prefer reusing locally authenticated CLIs (e.g., `gh`, `glab`) over managing tokens directly.
- If you cache template sources internally, never reuse the same mutable checkout for multiple created apps.

## Settings Example

Standalone provisioners are registered in Manifold settings. Bundled provisioners do not need a settings entry — they are auto-registered by the dispatcher.

```json
{
  "id": "company-backstage",
  "label": "Company Templates",
  "type": "cli",
  "command": "/usr/local/bin/manifold-company-provisioner",
  "args": ["--profile", "engineering"],
  "enabled": true
}
```

## Minimal Implementation Outline

1. Read and parse the request from `stdin`.
2. Validate `protocolVersion`.
3. Switch on `operation`.
4. Write `progress` events if needed.
5. Write a final `result` or `error` event to `stdout`.
6. Exit.

Reference implementations:

- bundled Vercel provisioner (shipped with Manifold): `provisioners/vercel/src/cli.ts`
- fixture standalone provisioner (for testing): `src/main/provisioning/__fixtures__/cli-provisioner-fixture.js`
