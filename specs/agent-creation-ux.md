# Agent Creation UX — Spec

## Overview

This spec covers the end-to-end UX for two related flows:

1. **Adding a repository** (first-time and repeat)
2. **Creating a first agent** (the "New Task" experience)

The guiding principle is **task-first, infrastructure-last**. Users of Claude Code, Codex, and Gemini CLI think in terms of what they want done — not which branch to use or what to name a worktree. The UX should reflect that mental model.

---

## Problem Statement

### Current State

When a user spawns an agent today, the flow is:

1. Click "+ New Agent"
2. Modal opens with two fields: **Runtime** (dropdown) and **Branch** (text input, auto-suggested)
3. Click "Launch"
4. A blank terminal opens — the user must manually type their task into the terminal

The `prompt` field in `SpawnAgentOptions` exists in the backend but is hardcoded to `''` in the UI. `sendInitialPrompt()` exits immediately when the string is empty. The agent starts with zero context.

### The Gap

Every AI coding tool that users compare Manifold against — Cursor, Copilot Workspace, Devin — puts **task description first**. The prompt is the product. Manifold currently treats it as an afterthought.

Secondary problems:
- Branch names like `manifold/oslo` are meaningless; users must map them mentally to actual work
- The welcome dialog forces a storage path decision before the user has done anything useful
- Adding a project and spawning an agent are two disconnected steps with no narrative thread between them

---

## Personas

**Primary**: A developer actively using Claude Code or Codex in their workflow. Comfortable with git, CLIs, and AI agents. Values speed and transparency. Does not want to configure infrastructure — wants to describe work and have it happen.

**Secondary**: A team lead running multiple parallel agents on different features. Wants to see what each agent is doing at a glance without clicking into each one.

---

## Proposed Flows

### Flow 1: Welcome / First-Time Setup

**Current**: A modal asking the user to choose a storage directory path.

**Proposed**: Remove the storage path from the first-time experience entirely. The default (`~/.manifold`) is fine for almost all users. Move storage path configuration to Settings, where it belongs.

The first screen a new user sees should be:

```
┌──────────────────────────────────────────────┐
│                                              │
│             Manifold                         │
│                                              │
│   Run multiple AI coding agents in parallel. │
│   Each works on a different task, in its     │
│   own branch, simultaneously.                │
│                                              │
│   [ Open a local project ]                   │
│   [ Clone a repository   ]                   │
│                                              │
└──────────────────────────────────────────────┘
```

No configuration. No path selection. Just the two actions that matter.

**Behavior**:
- "Open a local project" → OS directory picker → project added → immediately into "New Task" flow (see Flow 3)
- "Clone a repository" → inline URL input → git clone → project added → immediately into "New Task" flow

---

### Flow 2: Adding a Project (Repeat Use)

The sidebar's "+ Add" and "Clone" buttons remain unchanged in function. The only change: after a project is successfully added or cloned, the app transitions directly into the **New Task** modal for that project, rather than dropping the user at an empty state.

This threads the two steps (add repo → start working) into a single intent-driven experience.

---

### Flow 3: New Task (replaces "New Agent" / "Launch Agent")

**Rename**: "New Agent" → "New Task" everywhere in the UI. This is not cosmetic — it shifts the mental model from infrastructure (spawning a process) to intent (accomplishing something).

**Modal design**:

```
┌───────────────────────────────────────────────────────┐
│  New Task                                        [×]   │
│                                                        │
│  What do you want to work on?                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │                                                  │  │
│  │                                                  │  │
│  │                                                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  Agent   [Claude Code ▼]                               │
│                                                        │
│  ▸ Advanced                                            │
│                                                        │
│             [Cancel]   [Start Task →]                  │
└───────────────────────────────────────────────────────┘
```

**"Advanced" section** (collapsed by default, chevron toggles it):

```
  Branch   [manifold/                              ]
            ↑ auto-derived, editable
```

#### Field Behavior

**Task description (textarea)**
- Autofocused when modal opens
- No placeholder text that pre-fills (keep the field clean)
- Subtle hint below: `Describe what you want the agent to do — it will receive this as its opening prompt`
- Required. "Start Task" button is disabled until at least one character is present

**Agent dropdown**
- Same options as today: Claude Code, Codex, Gemini, Custom
- Defaults to `settings.defaultRuntime`

**Branch (inside Advanced)**
- Auto-derived from the task description as the user types, with ~300ms debounce
- Derivation: lowercase the description, take the first 4–5 meaningful words (strip stopwords: the, a, an, in, to, for, of, on), kebab-case, prefix `manifold/`
- Examples:
  - "Fix the login session timeout bug" → `manifold/fix-login-session-timeout`
  - "Add dark mode to the settings panel" → `manifold/add-dark-mode-settings`
  - "Refactor database connection pool" → `manifold/refactor-database-connection`
- If the user has not opened Advanced, the derived name is used without them seeing it — it just works
- If the user opens Advanced, they see the derived name and can edit it freely
- Max derived length: 40 characters (truncate at last word boundary)

**"Start Task" button**
- Disabled when task description is empty
- On click: disables button, changes label to "Starting…"
- Invokes `agent:spawn` with `{ projectId, runtimeId, prompt: taskDescription, branchName }`
- On success: closes modal, activates the new session

#### What the Agent Receives

The task description is written to the PTY via the existing `sendInitialPrompt()` path, which is already implemented but never triggered. The agent (Claude Code, Codex, etc.) receives the task description as its first input and begins working immediately — no manual typing required.

---

### Flow 4: Session Display in Sidebar

**Current**:
```
● manifold/oslo     Claude Code
● manifold/bergen   Codex
```

**Proposed**:
```
● Fix login session timeout
  manifold/fix-login-session-timeout · Claude

● Add dark mode to settings
  manifold/add-dark-mode · Codex
```

The task description becomes the primary label. Branch name and runtime are secondary, shown smaller below. If no task description was provided (legacy sessions or sessions started before this change), fall back to the current branch name display.

The session object gains a `taskDescription?: string` field, persisted alongside the session.

---

## Data Model Changes

### `AgentSession` (existing, in `src/shared/types.ts`)

Add one field:

```typescript
taskDescription?: string   // the user-provided task description; undefined for legacy sessions
```

### `SpawnAgentOptions` (existing)

No change needed — `prompt` already exists. The UI simply needs to populate it.

### Session persistence

`taskDescription` should be stored in the worktree metadata (wherever runtime is currently persisted) so it survives app restarts and dormant session recovery.

---

## Non-Goals for This Spec

- **Context injection** (pasting GitHub issues, error output, files into the task) — valuable future work, explicitly out of scope here
- **Task templates** ("Fix all failing tests", "Write missing tests") — future work
- **AI-suggested tasks** based on git status or open PRs — future work
- **Renaming a task after it starts** — future work; for now, task description is set at spawn time and immutable

---

## Open Questions

1. **Empty task description on old sessions**: Should the sidebar show branch name as fallback, or a generic "Unnamed task"? Suggest: branch name fallback (preserves current behavior for existing users).

2. **Branch name collision**: If a derived branch name already exists, should the UI auto-append a suffix (`-2`, `-3`) or surface a validation error? Suggest: auto-append suffix silently, same as the current `branch:suggest` behavior.

3. **Task description length limit**: Should there be a character cap? Suggest: no hard cap in the textarea, but branch derivation truncates at 40 characters. Very long descriptions are fine — they make better prompts.

4. **"New Task" vs "New Agent" naming**: Renaming touches multiple surfaces (sidebar button, modal header, IPC channel labels in logs). IPC channel names (`agent:spawn` etc.) are internal and don't need to change. Only user-facing copy changes.

---

## Acceptance Criteria

- [ ] New Task modal has a task description textarea as its primary, autofocused field
- [ ] "Start Task" button is disabled when the textarea is empty
- [ ] Task description is sent as the initial prompt to the PTY on spawn
- [ ] Branch name is auto-derived from task description and shown under "Advanced"
- [ ] Branch name updates live as the user types (debounced)
- [ ] User can manually override the derived branch name via the Advanced section
- [ ] Task description is stored on the session and persists across restarts
- [ ] Sidebar shows task description as the primary label (branch name secondary)
- [ ] Sessions without a task description fall back to branch name display
- [ ] Welcome dialog does not show storage path configuration; it shows open/clone only
- [ ] Adding or cloning a project immediately opens the New Task modal for that project
