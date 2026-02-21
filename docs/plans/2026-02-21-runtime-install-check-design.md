# Runtime Installation Check Design

## Problem

When a user creates a new agent and selects a coding assistant (Claude Code, Codex, Gemini CLI) that is not installed on their system, the app attempts to spawn a PTY process that immediately fails. The user gets no clear feedback about what went wrong.

## Solution

Detect which runtimes are installed before presenting the agent creation UI. Block the launch button and show an inline message when an uninstalled runtime is selected.

## Changes

### 1. Main process — `src/main/runtimes.ts`

Add `listRuntimesWithStatus()` that runs `which <binary>` for each built-in runtime. Returns `AgentRuntime` objects with an `installed: boolean` field.

### 2. Shared types — `src/shared/types.ts`

Add optional `installed?: boolean` to `AgentRuntime`.

### 3. IPC handler — `src/main/ipc/settings-handlers.ts`

Update `registerRuntimesHandler` to call `listRuntimesWithStatus()` instead of `listRuntimes()`.

### 4. Renderer — `NewAgentPopover.tsx` and `NewTaskModal.tsx`

- Fetch runtimes from `runtimes:list` IPC when the modal opens (replace hardcoded `RUNTIMES` array).
- Show "(not installed)" suffix on uninstalled runtime labels.
- Disable Launch/Start button when selected runtime is not installed.
- Show inline warning: `"<name> is not installed. Please install it first."`

## Non-changes

- No modifications to `agent:spawn`, `SessionManager`, or `PtyPool`. The block is purely in the UI layer.
- The `custom` runtime option is unaffected (no install check for custom binaries).
