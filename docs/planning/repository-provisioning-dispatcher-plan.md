# Repository Provisioning Dispatcher Plan

Status: Accepted
Date: 2026-03-23

## Context

Simple view currently creates a project locally inside the Manifold storage directory, writes a `README.md`, runs `git init`, commits, registers the project, and then starts the agent.

That local-first flow is a good default for open source, but it is too narrow for the broader direction:

- We want predictable starter templates for different app types such as web apps and Rust services.
- We want organizational integrations where repository creation is handled outside Manifold, for example via Backstage templates and downstream workflows.
- We do not want company-specific logic in the open-source Manifold repository.
- We do not want two separate user-facing creation flows.
- We need both OSS and company-backed provisioning available from day one.

Current scope:

- This document focuses on the Simple view creation flow first.
- The same provisioning and template model should be reusable later in the Developer view onboarding flow, but that is not part of the initial implementation scope.

## Decision Summary

Manifold should support a single, generic provisioning system with a dispatcher in core.

- Manifold core owns the dispatcher, template catalog aggregation, UI flow, and project registration.
- Each provisioner is an external CLI executable that speaks a small JSON protocol.
- The open-source repo ships one bundled OSS provisioner, implemented in this repo but invoked through the same CLI protocol as any other provisioner.
- Organizations add their own provisioners outside this repo.
- The dispatcher queries all configured provisioners, merges their templates into one catalog, and routes creation requests to the selected provisioner.

This keeps Manifold open-source and generic while still allowing both OSS and organizational provisioning paths in the same product.

## Implementation Tracking

This document is the architecture and decision record for repository provisioning.

Implementation planning and status tracking should happen in:

- `docs/planning/repository-provisioning-implementation-plan.md`

When implementation starts, update the implementation plan to reflect:

- what Phase 1 items are complete
- what remains in progress
- what has been deferred to later phases

## Goals

- Keep one application creation flow in Simple view.
- Support multiple repository templates and tech stacks.
- Support multiple provisioners at the same time.
- Keep organization-specific logic outside the Manifold repo.
- Make provisioners plug and play to install and configure, including both the bundled OSS provisioner and external org provisioners.
- Support long-running provisioning operations with progress updates.
- Preserve a common post-provisioning flow inside Manifold: clone/open, register project, spawn agent.

## Non-Goals

- Embedding Backstage-specific code in Manifold core.
- Hardcoding GitHub, Vercel, or any company system into the core provisioning flow.
- Supporting arbitrary remote execution inside Manifold itself.
- Defining every template up front.

## Core Model

The key split is:

- Provisioner: how a repository is created and made ready.
- Template: what kind of application or repository gets created.

Examples:

- `web-react-vite` is a template.
- `rust-axum-service` is a template.
- `oss-bundled` is a provisioner.
- `backstage-company` is a provisioner.

Different app types should not require different creation flows in Manifold. They are selections within one catalog.

## Recommended Architecture

### 1. Provisioning Dispatcher in Manifold Core

Manifold should have a core dispatcher service that:

- loads configured provisioners
- asks each provisioner for its template catalog
- merges the results into a single template list
- routes create requests to the chosen provisioner
- receives the resulting repository details
- clones or opens the repository locally
- registers the project
- starts the agent

The dispatcher is generic. It knows nothing about Backstage, GitHub templates, or internal workflow rules.

### 2. External Provisioner Contract

Each provisioner is an external CLI executable configured in settings.

Examples:

- bundled OSS provisioner shipped with Manifold
- private company provisioner installed separately
- local development provisioner used for testing

The protocol should be JSON-based and versioned from day one.

Recommended operations:

- `listTemplates`
- `create`
- `health`

The transport should be one of:

- stdin/stdout JSON for request-response
- JSON lines over stdout for progress streaming during `create`

CLI-based external provisioners are the right starting point because they keep auth, private dependencies, and company-specific code outside Manifold.

### 3. Bundled OSS Provisioner

The open-source repository should ship one bundled provisioner that supports OSS-friendly templates.

Implementation guidance:

- the initial OSS provisioner should live in this repository
- it should be built and shipped together with Manifold
- Manifold should still invoke it through the same provisioner CLI contract used for external provisioners
- it should not become an in-process special case in core

Possible OSS behaviors:

- create from a pinned public template repo
- shallow clone a template ref, strip `.git`, then `git init`
- optionally support remote-first OSS flows later if needed

The exact bootstrap mechanism can evolve without changing the core protocol.

### 4. External Company Provisioner

The company provisioner should live outside this repo and can:

- call Backstage
- wait for workflow completion
- create identity and downstream resources
- return the final repository clone URL and metadata once ready

Manifold should treat it the same as any other provisioner.

## Why a Dispatcher in Core

We need both OSS and company-backed provisioning from day one. Requiring users to swap one active provisioner for another is not enough.

The dispatcher solves this without putting company specifics in the repo:

- Manifold exposes one flow and one template picker.
- The OSS repo only contains generic aggregation logic plus the bundled OSS provisioner.
- The private company provisioner remains fully external.

This is still one solution, not two bespoke product paths.

## Template Catalog Model

Each provisioner returns a list of template descriptors.

Suggested shape:

```json
{
  "id": "web-react-vite",
  "title": "Web App",
  "description": "React, TypeScript, Vite, local-first storage",
  "category": "Web",
  "provisionerId": "oss-bundled",
  "tags": ["react", "vite", "typescript"],
  "paramsSchema": {
    "type": "object",
    "properties": {
      "name": { "type": "string" },
      "description": { "type": "string" }
    },
    "required": ["name", "description"]
  }
}
```

Notes:

- `id` must be unique within a provisioner.
- The dispatcher should namespace templates internally as `provisionerId:templateId`.
- `paramsSchema` allows template-specific inputs without changing Manifold core for each new template.
- Template metadata should be enough to drive a future UI without hardcoded template forms.

## Create Request Model

Suggested request shape from Manifold to a provisioner:

```json
{
  "protocolVersion": 1,
  "operation": "create",
  "requestId": "req_123",
  "templateId": "web-react-vite",
  "inputs": {
    "name": "expense-tracker",
    "description": "Track personal expenses with categories and charts"
  }
}
```

Suggested final response:

```json
{
  "protocolVersion": 1,
  "status": "ready",
  "requestId": "req_123",
  "result": {
    "displayName": "expense-tracker",
    "repoUrl": "git@github.com:acme/expense-tracker.git",
    "defaultBranch": "main",
    "localPath": null,
    "metadata": {
      "providerProjectUrl": "https://backstage.example.com/catalog/default/component/expense-tracker"
    }
  }
}
```

Progress events during provisioning:

```json
{
  "protocolVersion": 1,
  "status": "progress",
  "requestId": "req_123",
  "message": "Waiting for repository workflow to finish"
}
```

## Local Materialization Rules

After a provisioner returns `ready`, Manifold should follow one shared path:

- materialize the final per-app repository inside the managed projects area
- if the provisioner returns `repoUrl`, Manifold clones it into the managed projects area
- provisioners should not return an arbitrary final `localPath` outside Manifold-managed storage in the initial design
- register the project
- detect the default branch
- spawn the simple-mode agent

Additional constraint:

- provisioners may reuse a shared template source internally, such as a cached clone of a GitHub template repository
- the repository returned to Manifold for a created app must always be a distinct working checkout for that app
- provisioners must not return the same mutable local checkout for multiple created apps

This keeps repository usage consistent regardless of how the repository was provisioned.

## Settings Model

Manifold should support a list of provisioners, not a single active provisioner.

Suggested settings shape:

```json
{
  "provisioning": {
    "provisioners": [
      {
        "id": "oss-bundled",
        "label": "Open Source Templates",
        "type": "builtin",
        "enabled": true
      },
      {
        "id": "company-backstage",
        "label": "Company Templates",
        "type": "cli",
        "command": "/usr/local/bin/manifold-company-provisioner",
        "args": [],
        "enabled": true
      }
    ]
  }
}
```

Important constraints:

- Manifold should not store company secrets itself if that can be avoided.
- Provisioners should own their own auth flow and credentials.
- Provisioners should be treated as trusted local executables.

## UI Implications

For the initial implementation, the Simple view UI should stay as one flow:

1. Choose template
2. Enter name and description
3. Fill template-specific fields if needed
4. Create application
5. Watch provisioning progress
6. Open app once the repository is ready

The template picker should be able to:

- group by category
- optionally show source or provisioner label
- hide provisioner complexity for simple users when possible

We should avoid exposing "pick a provisioner" as the primary UX. Users should usually pick a template, not an integration backend.

The same template catalog may later be reused in Developer view onboarding, but that should be treated as a follow-on product decision rather than part of the first delivery.

## Error Handling

The dispatcher must handle:

- provisioner unavailable
- invalid protocol response
- template listing failures from one provisioner while others still work
- create failure after a long-running remote workflow
- repository created remotely but clone failed locally
- duplicate project names

Recommended behavior:

- degraded template catalog if one provisioner is down
- per-template source attribution for debugging
- clear user-facing progress and error messages
- no partial project registration until a local repo is actually available

## Security and Trust

Because provisioners are external executables, the security model should be explicit:

- only locally configured provisioners are allowed
- the user or org admin is responsible for trusting the executable
- Manifold should validate protocol shape, not business logic
- company auth and policy enforcement stay outside Manifold

## Rollout Plan

### Phase 1

- Introduce a `ProvisioningDispatcher` service in main
- Introduce a versioned provisioner command protocol
- Move current `projects:create-new` logic behind the dispatcher
- Ship one bundled OSS provisioner
- Support at least one external CLI provisioner in addition to the bundled OSS provisioner
- Add a template catalog UI in Simple view

### Phase 2

- Support multiple external provisioners
- Add health checks and cached template catalogs
- Add richer progress streaming and structured errors
- Add template-specific input forms from schema

### Phase 3

- Add provisioner diagnostics in settings
- Add template search, favorites, and org defaults
- Add optional policy such as hiding templates based on environment or team

## Current Decisions

- The bundled OSS provisioner should focus on local repository creation in the initial phases. Remote OSS repo creation can be evaluated later.
- The initial OSS provisioner should live in this repository, be shipped with Manifold, and still be invoked through the same CLI protocol as any other provisioner.
- Templates should carry the full template contract, including the starter application, defaults, and agent-oriented assets such as Codex/Copilot/Claude Code skills where relevant.
- Manifold should prefer generic schema-driven rendering for template inputs instead of provisioner-specific custom UI wherever possible.
- The UI should show provisioner labels prominently.
- Final per-app repositories should always be materialized inside Manifold-managed storage in the initial design.
- We do need a way to refresh templates.

## Recommendation

Build a generic multi-provisioner dispatcher in Manifold core.

- Ship the OSS provisioner in this repo and invoke it through the same CLI protocol as any other provisioner.
- Keep the company provisioner entirely outside this repo.
- Treat templates as first-class catalog items.
- Keep one Simple view creation flow.
- Keep one shared post-provisioning path inside Manifold.

This is the smallest architecture that supports both the open-source product and company integration needs without baking company logic into Manifold.
