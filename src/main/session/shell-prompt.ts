import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { ShellPromptSegments } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/defaults'
import { shellPromptSegmentsFilePath } from './shell-prompt-config'

/**
 * Extract agent name from a worktree path.
 * Worktree dirs are named `manifold-<name>`, e.g. `manifold-oslo`.
 */
function agentNameFromCwd(cwd: string): string {
  const base = path.basename(cwd)
  return base.startsWith('manifold-') ? base.slice('manifold-'.length) : base
}

/**
 * Extract repository name from a managed worktree path:
 * `…/worktrees/<repo>/<worktree-dir>`. Falls back to the basename for
 * dirs outside the managed worktree layout (a repo opened in place).
 */
function repoNameFromCwd(cwd: string): string {
  const match = cwd.match(/\/worktrees\/([^/]+)\/[^/]+\/?$/)
  return match ? match[1] : path.basename(cwd)
}

/**
 * Build environment variables to inject into a Manifold worktree shell.
 */
export function buildShellEnv(cwd: string): Record<string, string> {
  const agentName = agentNameFromCwd(cwd)
  return {
    MANIFOLD_WORKTREE: '1',
    MANIFOLD_AGENT_NAME: agentName,
    MANIFOLD_REPO: repoNameFromCwd(cwd),
    MANIFOLD_BRANCH: `manifold/${agentName}`,
  }
}

/** Classify shell binary path into 'zsh' | 'bash' | 'other'. */
export function detectShell(shellPath: string): 'zsh' | 'bash' | 'other' {
  const base = shellPath.split('/').pop() ?? shellPath
  if (base === 'zsh') return 'zsh'
  if (base === 'bash') return 'bash'
  return 'other'
}

/** Escape a string for safe embedding inside a bash double-quoted string. */
function escapeBashDQ(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$')
}

/**
 * Create a temporary directory containing a .bashrc for a Manifold shell session.
 * Sources the user's ~/.bashrc for PATH/aliases, then overrides PS1.
 * The caller is responsible for cleaning up the directory on shell exit.
 */
export function createManifoldBashRcFile(promptContext: {
  agentName: string
  repoName?: string
}): string {
  const { agentName, repoName } = promptContext
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-bash-'))
  const displayName = repoName && repoName !== agentName
    ? `${repoName} [${agentName}]`
    : agentName
  const displayNameBash = displayName.replace(/'/g, "'\\''")
  const rc = `# Manifold bash prompt
# Source user config for PATH, aliases, completions
[[ -f ~/.bashrc ]] && source ~/.bashrc

# Manifold env
export MANIFOLD_WORKTREE=1
export MANIFOLD_AGENT_NAME="${escapeBashDQ(agentName)}"
export MANIFOLD_REPO="${escapeBashDQ(repoName ?? agentName)}"
export MANIFOLD_BRANCH="manifold/${escapeBashDQ(agentName)}"

# Disable prompt managers (starship, oh-my-posh, p10k)
unset STARSHIP_SESSION_KEY STARSHIP_SHELL POSH_SESSION_ID POSH_SHELL 2>/dev/null

# Disable prompt re-expansion so a repo/agent name containing \$(...) or
# backticks can never be run as a command when PS1 renders.
shopt -u promptvars

# Manifold PS1: "displayName ❯ "
PS1='\\[\\e[2m\\]${displayNameBash}\\[\\e[0m\\] \\[\\e[1m\\]❯\\[\\e[0m\\] '
PROMPT_COMMAND=''
`
  fs.writeFileSync(path.join(dir, '.bashrc'), rc, 'utf-8')
  return dir
}

/**
 * Build an ANSI-styled welcome line printed once when the shell spawns.
 * Uses dim gray so it's informational but doesn't dominate.
 * Palette slot 16 is mapped to the theme accent by the renderer
 * (src/shared/themes/adapter.ts), so accent text follows the active theme.
 */
export function buildWelcomeMessage(branch: string, cwd: string): string {
  const dim = '\x1b[2m'
  const accent = '\x1b[38;5;16m'
  const reset = '\x1b[0m'
  // Shorten home directory to ~
  const home = os.homedir()
  const displayPath = cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd
  return `${dim}●  ${accent}${branch}${reset}${dim}  ·  ${displayPath}${reset}\r\n${dim}💡 Type ${accent}#${reset}${dim} followed by your question for AI help${reset}\r\n`
}

/**
 * Prompt block whose segment toggles live in zsh variables seeded from the
 * spawn-time settings and re-sourced from the shared segments file whenever
 * it changes (one zstat per prompt, same caching pattern as kubeconfig
 * below). Settings saves rewrite that file, so live shells pick up new
 * prompt-segment settings at their next prompt render.
 *
 * The name renders as `repo [agent]` when both are on and distinct, and
 * collapses to a single accent name when only one is enabled or the names
 * coincide (shells outside managed worktrees). Kubernetes context/namespace
 * lookups fail silently: no kubectl or no active context hides the segments.
 */
function buildPromptBlock(
  agentName: string,
  repoName: string | undefined,
  segments: ShellPromptSegments,
  segmentsFile: string,
): string {
  return `# Manifold prompt — segment toggles re-read from the shared settings file.
# Color 16 is remapped to the theme accent by Manifold's terminal renderer.
zmodload -F zsh/stat b:zstat 2>/dev/null
typeset -g _manifold_seg_stamp="unset"
typeset -g _manifold_seg_repo=${segments.repo ? 1 : 0}
typeset -g _manifold_seg_agent=${segments.agent ? 1 : 0}
typeset -g _manifold_seg_k8s_ctx=${segments.k8sContext ? 1 : 0}
typeset -g _manifold_seg_k8s_ns=${segments.k8sNamespace ? 1 : 0}
typeset -g _manifold_k8s_stamp="unset"
typeset -g _manifold_k8s_ctx=""
typeset -g _manifold_k8s_ns=""

function _manifold_segments_refresh() {
  emulate -L zsh
  local cfg="${segmentsFile}"
  local stamp=""
  if [[ -f "\$cfg" ]]; then
    stamp="\$(zstat +inode "\$cfg" 2>/dev/null)-\$(zstat +mtime "\$cfg" 2>/dev/null)"
  fi
  [[ "\$stamp" == "\$_manifold_seg_stamp" ]] && return
  _manifold_seg_stamp="\$stamp"
  [[ -n "\$stamp" ]] && source "\$cfg" 2>/dev/null
  # Segment set changed — force the next k8s lookup to run again.
  _manifold_k8s_stamp="unset"
}

function _manifold_k8s_refresh() {
  emulate -L zsh
  (( _manifold_seg_k8s_ctx || _manifold_seg_k8s_ns )) || return 0
  local cfg="\${KUBECONFIG:-\$HOME/.kube/config}"
  cfg="\${cfg%%:*}"
  local stamp=""
  if [[ -f "\$cfg" ]]; then
    stamp="\$(zstat +mtime "\$cfg" 2>/dev/null)" || stamp=""
  fi
  [[ "\$stamp" == "\$_manifold_k8s_stamp" ]] && return
  _manifold_k8s_stamp="\$stamp"
  _manifold_k8s_ctx="\$(command kubectl config current-context 2>/dev/null)" || _manifold_k8s_ctx=""
  _manifold_k8s_ns=""
  if (( _manifold_seg_k8s_ns )) && [[ -n "\$_manifold_k8s_ctx" ]]; then
    _manifold_k8s_ns="\$(command kubectl config view --minify --output 'jsonpath={..namespace}' 2>/dev/null)" || _manifold_k8s_ns=""
  fi
}

function _manifold_prompt_refresh() {
  emulate -L zsh
  _manifold_segments_refresh
  _manifold_k8s_refresh
  local agent='${agentName}'
  local repo='${repoName ?? ''}'
  local name=""
  if (( _manifold_seg_repo && _manifold_seg_agent )); then
    if [[ -n "\$repo" && "\$repo" != "\$agent" ]]; then
      name="%F{16}\${repo}%f [\${agent}]"
    else
      name="%F{16}\${agent}%f"
    fi
  elif (( _manifold_seg_repo )); then
    name="%F{16}\${repo:-\$agent}%f"
  elif (( _manifold_seg_agent )); then
    name="%F{16}\${agent}%f"
  fi
  local p="\$name"
  (( _manifold_seg_k8s_ctx )) && [[ -n "\$_manifold_k8s_ctx" ]] && p+="\${p:+ }⎈ \${_manifold_k8s_ctx}"
  (( _manifold_seg_k8s_ns )) && [[ -n "\$_manifold_k8s_ns" ]] && p+="\${p:+ }(\${_manifold_k8s_ns})"
  PROMPT="\${p:+\$p }%F{white}❯%f "
}
autoload -Uz add-zsh-hook
add-zsh-hook precmd _manifold_prompt_refresh
_manifold_prompt_refresh
RPROMPT=''
`
}

/**
 * Create a temporary ZDOTDIR with a .zshrc that:
 * 1. Restores the user's real ZDOTDIR so their aliases/PATH still load
 * 2. Sources the user's .zshrc
 * 3. Overrides PROMPT with a clean Manifold prompt
 *
 * The prompt shows `repo [agent] ❯` so multi-repo workflows stay
 * recognizable; when the repo is unknown (or identical to the agent
 * name, as for shells outside managed worktrees) it stays `agent ❯`.
 * Which segments render (repo, agent, Kubernetes context/namespace) is
 * controlled by the `shellPromptSegments` setting; live shells follow
 * later changes by re-sourcing the shared segments file (issue #684).
 */
export function createManifoldZdotdir(
  promptContext: {
    agentName: string
    repoName?: string
    segments?: ShellPromptSegments
    segmentsFile?: string
  },
  historyDir?: string,
): string {
  const { agentName, repoName } = promptContext
  const segments = promptContext.segments ?? DEFAULT_SETTINGS.shellPromptSegments
  const segmentsFile = promptContext.segmentsFile ?? shellPromptSegmentsFilePath()
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

  // Note: ${agentName}/${repoName}/${segmentsFile} are JS template literal
  // variables baked into the file at write time — NOT zsh variable references
  // in the generated .zshrc. zsh constructs are escaped as \$ so they survive
  // into the written file.
  const promptBlock = buildPromptBlock(agentName, repoName, segments, segmentsFile)
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

${promptBlock}`

  fs.writeFileSync(path.join(dir, '.zshrc'), rc, 'utf-8')
  // Empty .zshenv prevents user's ~/.zshenv from being sourced from the temp ZDOTDIR
  fs.writeFileSync(path.join(dir, '.zshenv'), '', 'utf-8')

  return dir
}
