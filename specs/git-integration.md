# Git Integration — Specification

## Overview

This spec covers the UX and implementation plan for first-class git operations in Manifold: AI-assisted commit message generation, pull request creation, and conflict resolution. All AI generation uses the **session's active runtime** (claude/codex/gemini) in non-interactive mode — no new dependencies.

---

## Guiding Principles

- **Panels, not modals.** Git actions slide in as panels so the diff and terminal remain visible.
- **AI fills first, user edits.** AI-generated content pre-fills fields; the user always has final say. Never block on AI — show a spinner while generating.
- **Use the session's runtime.** Generation calls use whichever CLI binary the session is configured with (`claude -p`, `codex --non-interactive`, `gemini -p`, etc.).
- **Commit and PR are separate steps.** Never auto-create PRs. Keep them intentional.
- **Conflicts get distinct treatment.** The UI clearly distinguishes "uncommitted changes" from "merge conflicts" — they require different actions.

---

## Feature 1: Commit with AI Message

### Entry Point

A **"Commit"** button in the status bar, shown whenever `changedFiles.length > 0` and no merge conflict exists.

### UX Flow

1. User clicks "Commit" → a **CommitPanel** slides in from the right (same pane column as the code viewer).
2. The panel immediately shows the changed files list (already available from `DiffProvider`).
3. The commit message textarea shows a spinner and the placeholder `"Generating message…"` while the AI call runs in the background.
4. The AI generation completes (~2–3 s) and the message populates. The user can edit freely at any point.
5. User clicks **"Commit"** → runs `git add . && git commit -m "<message>"` in the worktree.
6. Panel closes. Status bar file-change count resets to 0.

### AI Generation Call

```
<runtime-binary> -p "Write a concise git commit message (subject line only, imperative mood, ≤72 chars) for the following diff. Output only the message, nothing else.\n\n<diff>"
```

The diff comes from the existing `DiffProvider.getDiff()` output. If generation fails or times out (>15 s), the textarea remains empty and editable — no error is shown in the user's face.

### New IPC Channel: `git:commit`

**Request**: `{ sessionId: string, message: string }`
**Response**: `void` (throws on non-zero exit)

**Handler** (main process):
1. `git add .` in `session.worktreePath`
2. `git commit -m "<message>"` in `session.worktreePath`

### New IPC Channel: `git:ai-generate`

**Request**: `{ sessionId: string, prompt: string }`
**Response**: `string` (stdout of the non-interactive runtime call)

**Handler** (main process):
1. Resolve the session's runtime binary from `session.runtimeId`
2. Spawn: `<binary> -p "<prompt>"` in `session.worktreePath`, capture stdout
3. Return trimmed stdout

> This channel is reused by PR description generation and conflict summarization.

---

## Feature 2: Pull Request Creation

### Entry Point

A **"Create PR"** button in the status bar, visible only when the worktree branch has ≥1 commit ahead of the base branch.

To determine ahead/behind status, a new `git:ahead-behind` IPC channel is polled after each commit and on session focus.

### UX Flow

1. User clicks "Create PR" → **PRPanel** slides in.
2. Panel shows:
   - **Title** field — initially the branch name formatted as a sentence; replaced by AI output once generated.
   - **Description** textarea — spinner while AI generates from commit log + diff summary.
   - **Base branch** — read from project settings, shown as read-only text (editable via settings).
3. User reviews/edits title and description.
4. User clicks **"Push & Create PR"** → existing `PrCreator.createPR()` logic runs.
5. On success: toast notification with a clickable link to the PR URL. Panel closes.

### AI Generation Prompt

**Title**:
```
<runtime-binary> -p "Write a short pull request title (≤60 chars, imperative mood) for a branch called '<branchName>' with these commits:\n<git log --oneline output>\nOutput only the title, nothing else."
```

**Description**:
```
<runtime-binary> -p "Write a pull request description in markdown. Include a brief summary and a bullet-point list of changes. Base it on these commits and diff summary:\n\nCommits:\n<git log --oneline>\n\nDiff summary:\n<first 4000 chars of diff>\n\nOutput only the markdown, nothing else."
```

### New IPC Channel: `git:ahead-behind`

**Request**: `{ sessionId: string }`
**Response**: `{ ahead: number, behind: number }`

**Handler**: runs `git rev-list --left-right --count <base>...<branch>` in `worktreePath`, parses two integers.

---

## Feature 3: Conflict Detection and Resolution

### Detection

`FileWatcher` already polls `git status --porcelain` every 2 seconds. Extend the status parser to identify lines beginning with `UU`, `AA`, or `DD` as merge conflicts.

When conflicts are detected, push a new `agent:conflicts` event to the renderer with the list of conflicted file paths.

### Status Bar Indicator

When conflicts exist, replace the normal changed-files badge with a **"⚠ Conflicts"** badge (distinct color). Clicking it opens the ConflictPanel.

### UX Flow

1. User clicks "⚠ Conflicts" → **ConflictPanel** slides in.
2. Panel lists each conflicted file.
3. For each file, two actions:
   - **"View"** — opens the file in Monaco with conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) syntax-highlighted.
   - **"Resolve with AI"** — triggers AI resolution (see below).
4. Once all files are resolved and staged, a **"Complete Merge"** button runs `git commit` (no `-m` needed; git uses the auto-generated merge commit message).

### AI Conflict Resolution

**Prompt**:
```
<runtime-binary> -p "You are resolving a git merge conflict. The file below contains conflict markers. Output only the fully resolved file content with all conflict markers removed, choosing the best resolution. Do not explain.\n\n<full file content with markers>"
```

**UX after generation**:
- Show a two-panel diff: left = conflicted original, right = proposed resolution.
- User clicks **"Accept"** → write resolved content to file → `git add <file>`.
- User clicks **"Edit"** → resolved content opens in Monaco for manual adjustment → user saves → `git add <file>`.
- If AI generation fails, open the file directly in Monaco for manual resolution.

### New IPC Channel: `git:resolve-conflict`

**Request**: `{ sessionId: string, filePath: string, resolvedContent: string }`
**Response**: `void`

**Handler**: writes `resolvedContent` to `path.join(worktreePath, filePath)`, then runs `git add <filePath>` in `worktreePath`.

---

## Architecture Changes

### New Main-Process Module: `GitOperationsManager`

Responsibility: commit, status-detail, ahead/behind, conflict detection, and non-interactive AI generation. Keeps `DiffProvider` focused on diffs and `PrCreator` focused on PR creation.

```
GitOperationsManager
├── commit(worktreePath, message)           → git add . && git commit -m
├── getStatusDetail(worktreePath)           → { conflicts, staged, unstaged }
├── getAheadBehind(worktreePath, base)      → { ahead, behind }
├── resolveConflict(worktreePath, file, content) → write + git add
└── aiGenerate(runtimeBinary, prompt, cwd) → string (stdout)
```

### New IPC Channels Summary

| Channel | Direction | Purpose |
|---|---|---|
| `git:commit` | invoke | Stage all and commit |
| `git:ai-generate` | invoke | Run runtime non-interactively, return text |
| `git:ahead-behind` | invoke | Commits ahead/behind base |
| `git:resolve-conflict` | invoke | Write resolved file + git add |
| `agent:conflicts` | push (main→renderer) | List of conflicted file paths |

Each new invoke channel requires updates in three places: `ipc-handlers.ts`, `preload/index.ts`, and the renderer hook that calls it.

### New Renderer Components

| Component | Description |
|---|---|
| `CommitPanel` | Slide-in panel: changed files + AI-generated commit message textarea + Commit button |
| `PRPanel` | Slide-in panel: AI-generated title + description + Push & Create PR button |
| `ConflictPanel` | Slide-in panel: list of conflicted files with View / Resolve with AI actions |

### Status Bar Extensions

Add to the right side of `StatusBar`:
- "Commit" button (shown when `changedFiles > 0` and no conflicts)
- "Create PR" button (shown when `ahead > 0`)
- "⚠ Conflicts" badge (shown when conflicts exist, replaces Commit button)

---

## Implementation Order

1. **`git:ai-generate` IPC + `GitOperationsManager.aiGenerate()`** — foundational, needed by all three features.
2. **`git:commit` IPC + `CommitPanel`** — highest frequency, lowest complexity, biggest immediate win.
3. **`git:ahead-behind` IPC + `PRPanel`** — builds on existing `PrCreator`, adds AI description.
4. **Conflict detection in `FileWatcher` + `agent:conflicts` push event** — extends existing polling.
5. **`git:resolve-conflict` IPC + `ConflictPanel`** — most complex, implement last.

---

## Open Questions

- Which flag does each runtime use for non-interactive mode? Confirmed: `claude -p`. Need to verify `codex` and `gemini` flags; may need a per-runtime `nonInteractiveFlag` field in `runtimes.ts`.
- Should the CommitPanel be a persistent slide-in or dismiss on commit? Leaning toward dismiss to keep the layout clean.
- Should `git:ai-generate` have a timeout? Proposed 15 s with silent fallback (empty string returned, field left blank for user to fill).
- Should PR description be generated from the full diff or just the commit log? Full diff is richer but may exceed context for large changes. Proposed: first 4000 chars of diff + full commit log.
