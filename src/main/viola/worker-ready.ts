import { stripAnsiForContext } from '../session/nl-command-translator'

/** How much of the tail is examined. Enough for a dialog, short enough to be the current screen. */
const TAIL_CHARS = 2_000

/**
 * A dialog that must not receive the prompt's Enter, or null when the screen is ordinary.
 *
 * This is a safety guard, not a readiness check: codex's startup menu runs
 * `brew upgrade --cask codex` on option 1, and a trust dialog answers a security question. Both
 * are matched on their menu shape (a numbered option), so a worker merely *writing* about an
 * update cannot look like one.
 */
export function blockingDialog(output: string): string | null {
  const tail = stripAnsiForContext(output).slice(-TAIL_CHARS)
  if (/\b\d\.\s*Update now\b/i.test(tail)) return 'codex is showing its startup update menu'
  if (/Do you trust the files/i.test(tail)) return 'the runtime is asking whether this folder is trusted'
  return null
}

/**
 * Whether the worker's composer appears to be drawn.
 *
 * Deliberately weak, and never a reason to fail a task. An earlier version demanded that MCP
 * startup had finished and that the screen had been quiet for 1.5s; both were wrong. Codex takes
 * typing while its servers start — its slowest configured server allows 120s — and a TUI animates
 * while idle, so "quiet" never arrives. That gate failed a healthy worker before it was ever
 * prompted. Treat this as "worth sending now"; the completion file remains the only timeout.
 */
export function composerVisible(runtimeId: string, output: string): boolean {
  const tail = stripAnsiForContext(output).slice(-TAIL_CHARS)
  switch (runtimeId) {
    case 'codex':
      return tail.includes('›')
    case 'claude':
      return tail.includes('❯')
    default:
      return tail.includes('❯') || tail.includes('›')
  }
}
