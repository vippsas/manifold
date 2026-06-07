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
  return `${dim}●  ${cyan}${branch}${dim}  ·  ${displayPath}${reset}\r\n${dim}💡 Type ${cyan}#${dim} followed by your question for AI help${reset}\r\n`
}

/**
 * Create a temporary ZDOTDIR with a .zshrc that:
 * 1. Restores the user's real ZDOTDIR so their aliases/PATH still load
 * 2. Sources the user's .zshrc
 * 3. Overrides PROMPT with a clean Manifold prompt
 */
export function createManifoldZdotdir(agentName: string, historyDir?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-shell-'))
  const userZdotdir = process.env.ZDOTDIR || os.homedir()

  if (historyDir) {
    fs.mkdirSync(historyDir, { recursive: true })
  }

  const historyBlock = historyDir
    ? `
# Shell history — shared per repository
HISTFILE="${historyDir}/.zsh_history"
HISTSIZE=10000
SAVEHIST=10000
setopt INC_APPEND_HISTORY
setopt HIST_IGNORE_DUPS
`
    : ''

  // Note: ${agentName} is a JS template literal variable baked into the file at
  // write time — it is NOT a zsh variable reference in the generated .zshrc.
  const rc = `# Manifold shell prompt — sources user config then overrides PROMPT
ZDOTDIR_ORIG="${userZdotdir}"

# Source user's zshrc for PATH, aliases, functions, completions
if [[ -f "${userZdotdir}/.zshrc" ]]; then
  ZDOTDIR="${userZdotdir}"
  source "${userZdotdir}/.zshrc"
fi

# Disable prompt managers that continue rendering through hooks/widgets
unset STARSHIP_SESSION_KEY STARSHIP_SHELL POSH_SESSION_ID POSH_SHELL POSH_SHELL_VERSION POSH_THEME POSH_PROMPT_COUNT POWERLINE_COMMAND 2>/dev/null

function manifold_remove_prompt_manager_hooks() {
  emulate -L zsh
  autoload -Uz add-zsh-hook
  local hook fn pattern
  local -a prompt_hook_patterns
  prompt_hook_patterns=(
    '_omp_*'
    'prompt_ohmyposh_*'
    'starship_*'
    '_p9k_*'
    'prompt_powerlevel9k_*'
    'prompt_powerlevel10k_*'
  )

  for hook in precmd preexec chpwd periodic; do
    local hook_array="\${hook}_functions"
    for fn in \${(P)hook_array}; do
      for pattern in "\${prompt_hook_patterns[@]}"; do
        if [[ "\${fn}" == \${~pattern} ]]; then
          add-zsh-hook -d "\${hook}" "\${fn}" 2>/dev/null
          break
        fi
      done
    done
  done
}
manifold_remove_prompt_manager_hooks
unset -f manifold_remove_prompt_manager_hooks 2>/dev/null

function manifold_restore_omp_widgets() {
  emulate -L zsh
  local widget backup
  for widget in self-insert zle-line-init; do
    backup="._omp_original::\${widget}"
    if [[ -n "\${widgets[\$backup]-}" ]]; then
      zle -A "\${backup}" "\${widget}" 2>/dev/null
      zle -D "\${backup}" 2>/dev/null
    elif [[ "\${widgets[\$widget]-}" == user:_omp_* ]]; then
      zle -D "\${widget}" 2>/dev/null
    fi
  done
}
manifold_restore_omp_widgets
unset -f manifold_restore_omp_widgets 2>/dev/null
${historyBlock}
# Enable # as comment character in interactive mode (required for NL command translator)
setopt INTERACTIVE_COMMENTS

# Override prompt with clean Manifold style
PROMPT='%F{cyan}${agentName}%f %F{white}❯%f '
RPROMPT=''
`

  fs.writeFileSync(path.join(dir, '.zshrc'), rc, 'utf-8')
  // Empty .zshenv prevents user's ~/.zshenv from being sourced from the temp ZDOTDIR
  fs.writeFileSync(path.join(dir, '.zshenv'), '', 'utf-8')

  return dir
}
