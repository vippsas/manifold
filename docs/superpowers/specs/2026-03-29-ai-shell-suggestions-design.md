# AI Shell Command Prediction

## Problem

Users rarely work in the shell pane — they spend most time in the agent pane. When they do switch to the shell, they often need to run predictable commands (git operations, test runs, build commands). Currently they must type everything manually or arrow-up through history.

## Solution

After each shell command completes, predict the next likely command using AI and display it as ghost text in the terminal. The user presses Tab to accept or just starts typing to dismiss.

## Trigger: Prompt Detection

The prediction fires when the shell returns to its prompt. We detect this by pattern-matching PTY output for the Manifold prompt we control:

```
<agentName> ❯
```

This is the prompt set by `createManifoldZdotdir()` in the generated `.zshrc`:
```
PROMPT='%F{cyan}${agentName}%f %F{white}❯%f '
```

When the prompt pattern is detected in PTY output, the main process fires the prediction pipeline asynchronously. If `shellPrompt` is disabled (user uses their own prompt), suggestions are not available.

## Context Gathering

Two sources, gathered in parallel:

1. **Shell history** — read the last 20 lines from the project's `HISTFILE` (`~/.manifold/history/<projectName>/.zsh_history`). Parse zsh extended history format if present (strip timestamps).

2. **Git status** — run `git status --porcelain` and `git branch --show-current` in the worktree cwd. Captures: current branch, modified/staged/untracked files, ahead/behind state.

Both are fast local operations (no network, no AI). If either fails, proceed with whatever context is available.

## AI Invocation

Uses the existing `GitOperationsManager.aiGenerate()` one-shot pattern:

- **Runtime:** The agent's runtime (from `session.runtimeId`)
- **Model args:** `runtime.aiModelArgs` (e.g., `['--model', 'haiku']` for Claude — the fastest/cheapest option)
- **Timeout:** 10 seconds (generous since latency isn't critical)
- **Prompt:**

```
You are a shell command predictor. Based on the shell history and git status below, predict the single most likely next command the user will run. Reply with ONLY the command, nothing else. No explanation, no markdown, no quotes.

Shell history (most recent last):
<last 20 commands>

Git status:
Branch: <branch>
<git status --porcelain output>

Working directory: <basename of cwd>

Predicted command:
```

The response is trimmed and used as-is. If empty or the AI call fails, no suggestion is shown (silent failure — never block the shell).

## Ghost Text Display

When the prediction returns, inject ghost text into the terminal via `ptyPool.pushOutput()`:

```
\x1b[2m<predicted command>\x1b[0m\x1b[<N>D
```

- `\x1b[2m` — dim/faint text (ANSI SGR attribute 2)
- `\x1b[0m` — reset attributes
- `\x1b[<N>D` — move cursor back N columns (length of predicted command) so the cursor stays at the prompt position

The ghost text appears on the same line as the prompt, after the `❯` character. It looks like a faded suggestion the user can accept.

## State Management

The main process tracks per-session suggestion state:

```typescript
interface ShellSuggestionState {
  /** The currently displayed suggestion text, or null if none */
  activeSuggestion: string | null
  /** Whether a prediction request is in flight */
  pending: boolean
}
```

This is stored on `InternalSession` (only for `__shell__` sessions). Only one suggestion is active at a time. A new prompt detection cancels any in-flight prediction.

## Acceptance (Tab Key)

The renderer intercepts Tab in the terminal's `onData` handler:

1. Renderer sends `shell:accept-suggestion` IPC with `sessionId`
2. Main process checks if there's an `activeSuggestion` for this session
3. If yes:
   - Clear the ghost text by overwriting with spaces and repositioning cursor
   - Write the command text to PTY stdin (without newline — user presses Enter to confirm)
   - Set `activeSuggestion = null`
4. If no active suggestion, forward the Tab keystroke to PTY as normal (for regular tab completion)

## Dismissal (Any Other Key)

When the user types any character other than Tab (or Enter):

1. Renderer sends `shell:dismiss-suggestion` IPC with `sessionId`
2. Main process clears the ghost text (overwrite with spaces, reposition cursor)
3. Sets `activeSuggestion = null`
4. The original keystroke is forwarded to PTY as normal

If no suggestion is active, dismiss is a no-op and the keystroke passes through unchanged.

## Cancellation

If a new prompt is detected while a prediction is still in flight (user ran a quick command), the in-flight request is abandoned:

- Set `pending = false`
- When the stale prediction returns, check `pending` — if false, discard the result
- Fire a new prediction for the latest prompt

## Data Flow

```
1. Shell command completes → PTY output contains prompt pattern
2. SessionStreamWirer detects prompt → fires ShellSuggestion.predict(session)
3. ShellSuggestion gathers context (HISTFILE + git status) in parallel
4. ShellSuggestion calls gitOps.aiGenerate() with prediction prompt
5. On success → ptyPool.pushOutput() injects ghost text
6. User presses Tab → renderer sends shell:accept-suggestion IPC
7. Main process writes command to PTY stdin, clears ghost text
   OR
6. User types anything → renderer sends shell:dismiss-suggestion IPC
7. Main process clears ghost text, forwards keystroke
```

## Files

| File | Action | Responsibility |
|------|--------|----------------|
| `src/main/session/shell-suggestion.ts` | Create | Prediction logic: context gathering, prompt building, ghost text injection/clearing |
| `src/main/session/session-stream-wirer.ts` | Modify | Detect Manifold prompt pattern in PTY output, trigger prediction |
| `src/main/session/session-types.ts` | Modify | Add `shellSuggestion` state to `InternalSession` |
| `src/main/ipc/agent-handlers.ts` | Modify | Add `shell:accept-suggestion` and `shell:dismiss-suggestion` handlers |
| `src/preload/index.ts` | Modify | Whitelist new IPC channels |
| `src/renderer/hooks/useTerminal.ts` | Modify | Intercept Tab key, route to accept/dismiss IPC |

## Constraints

- Only works when `shellPrompt: true` (Manifold controls the prompt pattern)
- Only works for `__shell__` sessions (not agent PTY sessions)
- Only zsh is supported (same as existing prompt feature)
- Silent failure on all errors — never block or break the shell
- One suggestion at a time per session
- No settings toggle in v1 (always on when shellPrompt is enabled)

## Not In Scope

- Multi-command suggestions
- Prefix-based completion (as user types)
- Settings UI toggle for enable/disable
- Non-zsh shell support
- Suggestion quality tracking or feedback loop
