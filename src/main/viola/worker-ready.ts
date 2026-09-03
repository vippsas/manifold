import { stripAnsiForContext } from '../session/nl-command-translator'

/**
 * Whether an interactive worker's TUI is ready to take a prompt.
 *
 * The shared session status reads "waiting" from a prompt-shaped character anywhere in the
 * output, and a TUI's startup banner has those. Viola typed a review prompt into a codex that
 * was still starting its MCP servers; codex redrew its composer and the text was gone, and the
 * reviewer then sat idle until its budget ran out. Readiness has to be positive — the composer
 * is drawn — and free of anything that would swallow keystrokes: a startup phase still running,
 * an update menu, a trust dialog, or a turn already in progress.
 */
export function workerComposerReady(runtimeId: string, output: string): boolean {
  const tail = stripAnsiForContext(output).slice(-3000)
  // Any interactive menu eats the next Enter; the "Update now" one runs `brew upgrade`.
  if (/Update now|Do you trust|Yes, proceed/i.test(tail)) return false
  switch (runtimeId) {
    case 'codex':
      return tail.includes('›') && !/Starting MCP servers \(\d+\/\d+\)/.test(tail)
    case 'claude':
      return tail.includes('❯') && !/esc to interrupt|Interrupt to stop/i.test(tail)
    default:
      return tail.includes('❯') || tail.includes('›')
  }
}
