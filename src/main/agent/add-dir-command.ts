/** How a runtime's TUI takes an extra working folder while it is already running.
 *
 *  Probed against claude 2.1.224, codex 0.147.0 and copilot 0.0.402 by driving
 *  each CLI in a pty and typing the command:
 *   - Claude Code prints a confirmation dialog ("Add directory to workspace",
 *     default "Yes, for this session") before it accepts.
 *   - Copilot applies it straight away ("Added directory to allowed list: …").
 *   - Codex has no such command — its palette offers /model, /fast, /ide,
 *     /permissions, /keymap, /vim, /experimental, /approve and nothing for
 *     folders. Typing `/add-dir …` there submits the text to the model as an
 *     ordinary prompt, so it must never be injected. Same for Gemini CLI, which
 *     is untested here. Those runtimes pick the folder up on their next launch,
 *     since session-resume rebuilds --add-dir from the session's dirs.
 */
export interface RuntimeAddDirCommand {
  /** Text to type into the composer. Enter is sent separately. */
  text: string
  /** Submitting raises a confirmation dialog whose default answer accepts. */
  needsConfirm: boolean
}

export function runtimeAddDirCommand(runtimeId: string, dir: string): RuntimeAddDirCommand | null {
  switch (runtimeId) {
    case 'claude':
    case 'ollama-claude':
      return { text: `/add-dir ${dir}`, needsConfirm: true }
    case 'copilot':
      return { text: `/add-dir ${dir}`, needsConfirm: false }
    default:
      return null
  }
}
