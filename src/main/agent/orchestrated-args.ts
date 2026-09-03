/**
 * Extra launch args for an *interactive* session an orchestrator spawned.
 *
 * A human-launched interactive agent keeps its permission prompts — that is the safe default and
 * must not change. An orchestrated worker has nobody at the keyboard when it starts, so a prompt
 * is not a safety gate there, it is a stall: the turn-end heuristic reads the idle prompt as a
 * finished turn and the orchestrator reviews an untouched tree.
 *
 * Only runtimes whose base registry args do not already bypass appear here. Copilot's entry
 * carries `--yolo`, so it needs nothing.
 */
const ORCHESTRATED_INTERACTIVE_ARGS: Record<string, readonly string[]> = {
  // The registry's `--allow-dangerously-skip-permissions` only enables bypass "as an option,
  // without it being enabled by default", so it alone still prompts.
  claude: ['--dangerously-skip-permissions'],
  // Also silence the startup update check: when a newer release exists, codex opens an
  // interactive "Update now" menu, and the worker's prompt and Enter land in that menu instead
  // of the composer. A real reviewer sat idle at it until its budget ran out.
  codex: ['--dangerously-bypass-approvals-and-sandbox', '-c', 'check_for_update_on_startup=false'],
  gemini: ['--yolo'],
}

/** Bash rules are prefix matches with `*` wildcards, so each spelling needs its own rule.
 *
 *  This is the *whole* deny list an orchestrated worker runs with: an inline `--settings`
 *  replaces the same key from the user's settings.json rather than merging with it. That is
 *  deliberate. Deny rules apply in every permission mode, so bypass cannot clear them, and a
 *  `Read()` deny rule makes Claude escalate any command whose read path it cannot determine —
 *  a `cd` before a `git grep` is enough. An unattended worker then waits for an approval nobody
 *  is there to give. Under bypass those rules are porous anyway, since they govern the Read tool
 *  and not what a shell command may `cat`. */
export const ORCHESTRATED_WORKER_DENY_RULES: readonly string[] = [
  'Bash(git push*--force*)',
  'Bash(git push* -f*)',
  'Bash(git push*--delete*)',
  'Bash(git push*--mirror*)',
  'Bash(git reset --hard*origin/*)',
  'Bash(rm -rf /*)',
  'Bash(rm -fr /*)',
  'Bash(rm -rf ~*)',
  'Bash(rm -fr ~*)',
  'Bash(rm -rf $HOME*)',
  'Bash(gh pr merge*)',
]

export function orchestratedInteractiveArgs(runtimeId: string): string[] {
  return [...(ORCHESTRATED_INTERACTIVE_ARGS[runtimeId] ?? [])]
}
