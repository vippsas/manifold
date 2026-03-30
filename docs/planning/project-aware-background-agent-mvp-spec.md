# Project-Aware Background Agent MVP Spec

Status: Draft
Date: 2026-03-30
Depends on:
- `docs/planning/context-aware-engineering-partner.md`

## Purpose

This document defines the MVP for a project-aware background agent that helps a developer from PM and architect altitude.

The MVP should understand the current project well enough to research the outside world and proactively surface useful ideas such as:

- new feature opportunities
- architectural improvement ideas
- relevant external patterns from similar tools
- important ecosystem shifts worth reacting to

The MVP is intentionally not a general autonomous agent. It is a selective research and synthesis system that produces a small number of high-signal suggestions with evidence and reasoning.

## Packaging Constraint

The background agent must live in its own folder with minimal dependencies on the main Manifold app.

This is an architecture requirement, not just a code organization preference. The agent should remain modular, independently testable, and loosely coupled to the host application so it can be removed later without major rewrites across the main product.

Required implications:

- the core agent logic must live outside `src/main`, `src/renderer`, and `src/shared`
- the main app should integrate through a thin host adapter
- the agent must depend on narrow interfaces, not on broad internal app modules
- UI components must consume agent outputs through stable contracts
- the agent should be able to run in-process for the MVP, but its boundaries should support future independent deployment if needed
- the main product should be able to remove the background agent later with limited code changes outside the host adapter and UI entry points

Recommended location:

- `background-agent/`

Recommended integration shape:

- `background-agent/` owns core logic, pipelines, ranking, source handling, and output schemas
- `src/main/background-agent-host/` owns the adapter between Manifold and the agent
- the renderer only reads agent outputs through IPC or a shared DTO surface

## MVP Goal

Deliver a background agent that can produce a curated feed of source-backed suggestions relevant to the current project.

For the MVP, success means:

- the system can build a usable project profile from local project artifacts
- the system can gather external research from the web
- the system can synthesize that material into a small set of suggestions
- each suggestion includes evidence, relevance, and why-now reasoning
- developers can give simple feedback so ranking improves over time

## MVP Non-Goals

Out of scope for the MVP:

- direct code modification
- autonomous execution of implementation tasks
- broad PR review or test review automation
- real-time interruption during active editing
- full multi-user collaboration workflows
- deep customization per team or org
- perfect long-term memory or full organizational knowledge graphs

## Primary User

The primary user is an individual developer or technical founder who wants proactive product and architecture guidance without leaving their current project context.

This user wants help answering questions like:

- what should we build next?
- what are similar tools doing that we should examine?
- where is our architecture likely to become a bottleneck?
- what external changes should affect our roadmap?

## MVP Output

The MVP should produce a curated suggestion feed.

Each suggestion should include:

- title
- category
- short summary
- why it matters for this project
- supporting sources
- key evidence or examples
- confidence level
- novelty estimate
- rough effort / impact framing
- created date

Initial categories:

- `feature_opportunity`
- `architecture_improvement`
- `pattern_transfer`
- `ecosystem_shift`

## Suggestion Quality Bar

The system should prefer silence over weak suggestions.

A suggestion should only be shown if it is:

- relevant to the current project
- supported by credible external evidence
- non-obvious or usefully reframed
- specific enough to act on
- timely enough to matter now
- backed by at least one high-trust source and one additional corroborating signal

Low-signal trend summaries should be rejected.

## MVP Inputs

### Local Project Inputs

The MVP should build a project profile from a narrow but high-value set of local inputs:

- repository README and top-level docs
- architecture and planning docs
- package manifests and dependency data
- shallow repository structure signals
- recent pull requests or recent local changes where available
- issues, TODOs, or notes that indicate roadmap direction

The MVP should be docs-first and metadata-heavy. It does not need deep code understanding in v1. Shallow code structure signals are enough if they help the project profile stay grounded.

### External Inputs

The MVP should gather external signals from a small number of source classes:

- official docs and changelogs
- open source repositories and issue discussions
- engineering blogs and design writeups
- technical forums and practitioner communities

The system should favor primary or high-signal sources over generic SEO content.

For v1:

- official docs, changelogs, OSS repos, OSS issues, OSS discussions, and strong engineering blogs are allowed as primary inputs
- forums and practitioner communities are allowed only as supporting evidence, not as the sole basis for a suggestion
- generic SEO blog posts and low-signal social chatter should be excluded

## Core MVP Workflow

### 1. Build Project Profile

Summarize the current project into a durable working model:

- product type
- target user
- major workflows
- current architecture shape
- dependency stack
- likely open questions or growth areas

### 2. Generate Research Topics

Based on the project profile, generate a small set of focused research topics such as:

- comparable products
- similar architectural patterns
- expected feature categories
- ecosystem shifts affecting the current stack

Similarity to "other tools" should use a three-ring model:

- Ring 1: direct competitors or the same product category
- Ring 2: tools solving the same workflow or user problem
- Ring 3: tools with similar architecture, interaction patterns, or technical constraints

### 3. Gather External Evidence

Search and retrieve external material for each topic.

### 4. Synthesize Suggestions

Turn research findings into candidate suggestions tied back to the local project.

### 5. Rank And Filter

Only publish the strongest suggestions based on:

- relevance
- evidence quality
- novelty
- feasibility
- timeliness

### 6. Deliver Feed

Show a curated feed rather than a constant stream.

### 7. Capture Feedback

Allow the developer to mark suggestions as:

- useful
- not relevant
- obvious
- weak evidence
- badly timed

## Delivery Model

For the MVP, delivery should be lightweight and non-intrusive.

Recommended shapes:

- an on-demand feed view inside Manifold
- a new tab in the existing pane that already hosts the agent and search experiences
- an explicit "refresh ideas" action

The preferred MVP UI is the new tab in that existing pane, so the background agent lives alongside adjacent discovery and assistant workflows rather than as a separate major surface.

For v1, the system should run primarily on demand. Scheduled digests and more proactive delivery can wait until trust and ranking quality are stronger.

The MVP should avoid aggressive push behavior. Trust should be built before interruption.

## AI Runtime Selection

For AI execution, the MVP should reuse the AI coding assistant the user is already using in the current agent.

Requirements:

- when the background agent needs model reasoning, it should use the same runtime already configured for the user's current agent
- if there is no current active agent to reuse, it should fall back to the project default runtime
- that runtime should be invoked in non-interactive mode
- the MVP should not introduce a separate background-agent model picker or separate assistant configuration
- runtime selection should flow through the host adapter, not be hardcoded inside `background-agent/`

This keeps the experience consistent with the user's current workflow and avoids creating a second AI configuration surface for the same project context.

## Architecture Boundary

The packaging boundary is part of the MVP.

### Recommended Folder Layout

```text
background-agent/
  core/
    project-profile/
    research/
    synthesis/
    ranking/
    feedback/
  connectors/
    local-project/
    web/
  schemas/
  tests/

src/main/background-agent-host/
```

### Boundary Rules

- `background-agent/` must not import from `src/renderer`
- `background-agent/` must not import broad app internals from `src/main`
- shared data should move through explicit DTOs or schemas
- host-specific concerns such as IPC, persistence wiring, and UI events stay in `src/main/background-agent-host/`
- the host adapter should be replaceable without rewriting core agent logic

## MVP Interfaces

The MVP needs a small set of interfaces between Manifold and the agent.

### Host To Agent

- `buildProjectProfile(projectId | localPath)`
- `refreshSuggestions(projectId | localPath)`
- `recordSuggestionFeedback(suggestionId, feedbackType)`
- `listSuggestions(projectId | localPath)`
- `runBackgroundAgentPrompt(projectId | localPath, prompt, runtimeContext)`

### Agent To Host

- project profile summary
- suggestion list
- suggestion source metadata
- suggestion generation status
- runtime context for non-interactive execution

The exact transport can stay local for the MVP, but the contract should look extractable.

## Data Persistence

The MVP should persist only what is needed:

- latest project profile
- cached research artifacts or source references
- generated suggestions
- feedback events

Persistence should be simple and local-first. Avoid coupling the MVP to large new storage systems.

## Source And Trust Rules

The MVP should attach sources to every externally-derived suggestion.

Rules:

- cite source URL and source title
- include source date when available
- distinguish source facts from model inferences
- prefer recent sources for fast-moving topics
- prefer official docs and original engineering writeups over third-party summaries when possible
- do not show a suggestion unless it has at least one high-trust source and one additional corroborating signal

## Evaluation

The MVP should be evaluated on quality, not volume.

Primary evaluation dimensions:

- suggestion relevance
- suggestion novelty
- source quality
- feedback positivity rate
- low hide / mute rate
- follow-up rate on surfaced suggestions

A healthy MVP should produce relatively few suggestions, but they should feel specific and worth reading.

## MVP Risks

Primary risks:

- generic ideas that are not truly project-specific
- poor source quality or stale external research
- suggestions that are interesting but not actionable
- too much output with too little ranking discipline
- architecture leakage where the agent becomes tightly coupled to Manifold internals

The last risk matters because it undermines modularity and makes the system harder to evolve safely.

## Phase 1 Build Slice

A practical first build slice for the MVP:

1. Create `background-agent/` and the host adapter boundary.
2. Build project profiling from local docs and package metadata.
3. Support a narrow research flow for comparable tools and ecosystem changes.
4. Generate a feed of 3-5 ranked suggestions.
5. Store feedback on each suggestion.
6. Expose the feed in a simple internal UI surface.

This is enough to validate whether the product produces useful ideas before expanding scope.

## Resolved MVP Decisions

- project profiling in v1 should be docs-first and metadata-heavy, with only shallow code structure signals
- delivery in v1 should be primarily on demand through the new tab and explicit refresh
- official docs, changelogs, OSS repos, OSS issues, OSS discussions, and strong engineering blogs are the primary allowed source classes in v1
- forums and practitioner communities may support a suggestion, but should not be the only evidence behind it
- similarity to other tools should use the three-ring model: direct competitors, same-workflow tools, and similar architecture or interaction patterns
- a suggestion should only be shown if it has at least one high-trust source and one additional corroborating signal
