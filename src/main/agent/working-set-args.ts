/**
 * Translate a workspace agent's extra repo roots into the launch flags for its
 * runtime. The PTY is spawned with cwd = the primary worktree, which every CLI
 * treats as its root, so only the *additional* dirs need flags here.
 */
export function buildWorkingSetArgs(runtimeId: string, additionalDirs: string[]): string[] {
  if (additionalDirs.length === 0) return []
  switch (runtimeId) {
    case 'claude':
    case 'ollama-claude':
      // Claude Code: --add-dir is variadic.
      return ['--add-dir', ...additionalDirs]
    case 'codex':
    case 'ollama-codex':
    case 'copilot':
      // Codex & Copilot: --add-dir takes a single dir; repeat it.
      return additionalDirs.flatMap((dir) => ['--add-dir', dir])
    case 'gemini':
      // Gemini CLI: --include-directories takes a comma-separated list.
      return ['--include-directories', additionalDirs.join(',')]
    default:
      return []
  }
}
