import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

/**
 * Extract agent name from a worktree path.
 * Worktree dirs are named `manifold-<name>`, e.g. `manifold-oslo`.
 */
function agentNameFromCwd(cwd: string): string {
  const base = path.basename(cwd)
  return base.startsWith('manifold-') ? base.slice('manifold-'.length) : base
}

/**
 * Build environment variables to inject into a Manifold worktree shell.
 */
export function buildShellEnv(cwd: string): Record<string, string> {
  const agentName = agentNameFromCwd(cwd)
  return {
    MANIFOLD_WORKTREE: '1',
    MANIFOLD_AGENT_NAME: agentName,
    MANIFOLD_BRANCH: `manifold/${agentName}`,
  }
}

/**
 * Build an ANSI-styled welcome line printed once when the shell spawns.
 * Uses dim gray so it's informational but doesn't dominate.
 */
export function buildWelcomeMessage(branch: string, cwd: string): string {
  const dim = '\x1b[2m'
  const cyan = '\x1b[36m'
  const reset = '\x1b[0m'
  // Shorten home directory to ~
  const home = os.homedir()
  const displayPath = cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd
  return `${dim}●  ${cyan}${branch}${dim}  ·  ${displayPath}${reset}\r\n`
}

/**
 * Create a temporary ZDOTDIR with a .zshrc that:
 * 1. Restores the user's real ZDOTDIR so their aliases/PATH still load
 * 2. Sources the user's .zshrc
 * 3. Overrides PROMPT with a clean Manifold prompt
 */
export function createManifoldZdotdir(agentName: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-shell-'))
  const userZdotdir = process.env.ZDOTDIR || os.homedir()

  const rc = `# Manifold shell prompt — sources user config then overrides PROMPT
ZDOTDIR_ORIG="${userZdotdir}"

# Source user's zshrc for PATH, aliases, functions, completions
if [[ -f "${userZdotdir}/.zshrc" ]]; then
  ZDOTDIR="${userZdotdir}"
  source "${userZdotdir}/.zshrc"
fi

# Override prompt with clean Manifold style
PROMPT='%F{cyan}${agentName}%f %F{white}❯%f '
RPROMPT=''
`

  fs.writeFileSync(path.join(dir, '.zshrc'), rc, 'utf-8')
  // Create empty .zshenv to prevent global /etc/zshenv from loading ZDOTDIR twice
  fs.writeFileSync(path.join(dir, '.zshenv'), '', 'utf-8')

  return dir
}
