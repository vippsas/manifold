import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildShellEnv, buildWelcomeMessage, createManifoldZdotdir } from './shell-prompt'
import { resolveShellHistoryDir } from '../ipc/agent-handlers'

describe('buildShellEnv', () => {
  it('sets MANIFOLD env vars from worktree path', () => {
    const env = buildShellEnv('/Users/me/.manifold/worktrees/myproject/manifold-oslo')
    expect(env.MANIFOLD_WORKTREE).toBe('1')
    expect(env.MANIFOLD_BRANCH).toBe('manifold/oslo')
    expect(env.MANIFOLD_AGENT_NAME).toBe('oslo')
    expect(env.MANIFOLD_REPO).toBe('myproject')
  })

  it('handles paths without manifold- prefix gracefully', () => {
    const env = buildShellEnv('/some/random/path')
    expect(env.MANIFOLD_WORKTREE).toBe('1')
    expect(env.MANIFOLD_AGENT_NAME).toBe('path')
    expect(env.MANIFOLD_BRANCH).toBe('manifold/path')
    expect(env.MANIFOLD_REPO).toBe('path')
  })
})

describe('buildWelcomeMessage', () => {
  it('returns ANSI-styled one-liner with branch and path', () => {
    const msg = buildWelcomeMessage('manifold/oslo', '/Users/me/.manifold/worktrees/myproject/manifold-oslo')
    expect(msg).toContain('manifold/oslo')
    expect(msg).toContain('manifold-oslo')
    expect(msg).toMatch(/\x1b\[/) // contains ANSI escape codes
    expect(msg.endsWith('\r\n')).toBe(true)
  })
})

describe('createManifoldZdotdir', () => {
  let zdotdir: string | null = null
  let userZdotdir: string | null = null
  const originalZdotdir = process.env.ZDOTDIR
  const zshAvailable = spawnSync('zsh', ['-fc', 'exit 0']).status === 0
  const itIfZsh = zshAvailable ? it : it.skip

  afterEach(() => {
    if (zdotdir) {
      fs.rmSync(zdotdir, { recursive: true, force: true })
      zdotdir = null
    }
    if (userZdotdir) {
      fs.rmSync(userZdotdir, { recursive: true, force: true })
      userZdotdir = null
    }
    if (originalZdotdir === undefined) {
      delete process.env.ZDOTDIR
    } else {
      process.env.ZDOTDIR = originalZdotdir
    }
  })

  it('creates a temp directory with a .zshrc that sets PROMPT', () => {
    zdotdir = createManifoldZdotdir({ agentName: 'oslo' })
    expect(fs.existsSync(zdotdir)).toBe(true)
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).toContain('ZDOTDIR_ORIG')
    expect(rc).toContain('oslo')
    expect(rc).toContain('PROMPT=')
  })

  it('shows repository and agent in the prompt when both are known', () => {
    zdotdir = createManifoldZdotdir({ agentName: 'oslo', repoName: 'myproject' })
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).toContain("PROMPT='%F{16}myproject%f [oslo] %F{white}❯%f '")
  })

  it('falls back to the agent-only prompt when the repo matches the agent name', () => {
    zdotdir = createManifoldZdotdir({ agentName: 'myrepo', repoName: 'myrepo' })
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).toContain("PROMPT='%F{16}myrepo%f %F{white}❯%f '")
  })

  it('renders only the repository when the agent segment is disabled', () => {
    zdotdir = createManifoldZdotdir({
      agentName: 'oslo',
      repoName: 'myproject',
      segments: { repo: true, agent: false, k8sContext: false, k8sNamespace: false },
    })
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).toContain("PROMPT='%F{16}myproject%f %F{white}❯%f '")
  })

  it('renders only the agent when the repo segment is disabled', () => {
    zdotdir = createManifoldZdotdir({
      agentName: 'oslo',
      repoName: 'myproject',
      segments: { repo: false, agent: true, k8sContext: false, k8sNamespace: false },
    })
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).toContain("PROMPT='%F{16}oslo%f %F{white}❯%f '")
  })

  it('renders a bare glyph prompt when all segments are disabled', () => {
    zdotdir = createManifoldZdotdir({
      agentName: 'oslo',
      repoName: 'myproject',
      segments: { repo: false, agent: false, k8sContext: false, k8sNamespace: false },
    })
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).toContain("PROMPT='%F{white}❯%f '")
  })

  it('adds a kubeconfig-cached precmd refresh when the k8s context segment is enabled', () => {
    zdotdir = createManifoldZdotdir({
      agentName: 'oslo',
      repoName: 'myproject',
      segments: { repo: true, agent: true, k8sContext: true, k8sNamespace: false },
    })
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).toContain('kubectl config current-context')
    expect(rc).toContain('add-zsh-hook precmd _manifold_prompt_refresh')
    expect(rc).toContain('%F{16}myproject%f [oslo]')
    // Namespace lookup is only generated when its segment is enabled
    expect(rc).not.toContain('jsonpath={..namespace}')
  })

  it('adds the namespace lookup when the k8s namespace segment is enabled', () => {
    zdotdir = createManifoldZdotdir({
      agentName: 'oslo',
      repoName: 'myproject',
      segments: { repo: true, agent: true, k8sContext: true, k8sNamespace: true },
    })
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).toContain('jsonpath={..namespace}')
  })

  itIfZsh('falls back to the static segments when kubectl is unavailable', () => {
    userZdotdir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-user-zdotdir-'))
    fs.writeFileSync(path.join(userZdotdir, '.zshrc'), '', 'utf-8')
    process.env.ZDOTDIR = userZdotdir

    zdotdir = createManifoldZdotdir({
      agentName: 'oslo',
      repoName: 'myproject',
      segments: { repo: true, agent: true, k8sContext: true, k8sNamespace: true },
    })

    const result = spawnSync('zsh', ['-i', '-c', 'print -r -- "prompt=$PROMPT"'], {
      env: { ...process.env, ZDOTDIR: zdotdir, PATH: '/usr/bin:/bin', KUBECONFIG: '/nonexistent/kubeconfig' },
      encoding: 'utf-8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('prompt=%F{16}myproject%f [oslo] %F{white}❯%f ')
  })

  it('configures HISTFILE when historyDir is provided', () => {
    zdotdir = createManifoldZdotdir({ agentName: 'oslo' }, '/tmp/test-history')
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).toContain('HISTFILE="/tmp/test-history/.zsh_history"')
    expect(rc).toContain('HISTSIZE=10000')
    expect(rc).toContain('SAVEHIST=10000')
    expect(rc).toContain('setopt INC_APPEND_HISTORY')
    expect(rc).toContain('setopt HIST_IGNORE_DUPS')
  })

  it('does not include HISTFILE when historyDir is undefined', () => {
    zdotdir = createManifoldZdotdir({ agentName: 'oslo' })
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).not.toContain('HISTFILE')
  })

  itIfZsh('removes external prompt-manager hooks before setting the Manifold prompt', () => {
    userZdotdir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-user-zdotdir-'))
    fs.writeFileSync(
      path.join(userZdotdir, '.zshrc'),
      `
autoload -Uz add-zsh-hook
function _omp_precmd() {}
function _omp_preexec() {}
function prompt_ohmyposh_precmd() {}
function starship_precmd() {}
function _omp_zle-line-init() {}
function user_precmd() {}
add-zsh-hook precmd _omp_precmd
add-zsh-hook preexec _omp_preexec
add-zsh-hook precmd prompt_ohmyposh_precmd
add-zsh-hook precmd starship_precmd
add-zsh-hook precmd user_precmd
zle -N zle-line-init _omp_zle-line-init
export POSH_SESSION_ID=external
export STARSHIP_SESSION_KEY=external
PROMPT='external prompt'
RPROMPT='external right prompt'
`,
      'utf-8',
    )

    process.env.ZDOTDIR = userZdotdir
    zdotdir = createManifoldZdotdir({ agentName: 'oslo', repoName: 'myproject' })

    const result = spawnSync(
      'zsh',
      [
        '-i',
        '-c',
        [
          'print -r -- "precmd=${precmd_functions[*]-}"',
          'print -r -- "preexec=${preexec_functions[*]-}"',
          'print -r -- "prompt=$PROMPT"',
          'print -r -- "rprompt=$RPROMPT"',
          'print -r -- "posh=${POSH_SESSION_ID-}"',
          'print -r -- "starship=${STARSHIP_SESSION_KEY-}"',
          'print -r -- "zle_line_init=${widgets[zle-line-init]-}"',
        ].join('; '),
      ],
      {
        env: { ...process.env, ZDOTDIR: zdotdir },
        encoding: 'utf-8',
      },
    )

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('precmd=user_precmd')
    expect(result.stdout).toContain('preexec=')
    expect(result.stdout).not.toContain('_omp_precmd')
    expect(result.stdout).not.toContain('_omp_preexec')
    expect(result.stdout).not.toContain('prompt_ohmyposh_precmd')
    expect(result.stdout).not.toContain('starship_precmd')
    expect(result.stdout).toContain('prompt=%F{16}myproject%f [oslo] %F{white}❯%f ')
    expect(result.stdout).toContain('rprompt=')
    expect(result.stdout).toContain('posh=')
    expect(result.stdout).toContain('starship=')
    expect(result.stdout).not.toContain('posh=external')
    expect(result.stdout).not.toContain('starship=external')
    expect(result.stdout).not.toContain('_omp_zle-line-init')
  })
})

describe('resolveShellHistoryDir', () => {
  it('returns project-scoped path for worktree cwd', () => {
    const dir = resolveShellHistoryDir(
      '/Users/me/.manifold/worktrees/myproject/manifold-oslo',
      'project',
    )
    expect(dir).toBe(path.join(os.homedir(), '.manifold', 'history', 'myproject'))
  })

  it('falls back to basename for non-worktree cwd', () => {
    const dir = resolveShellHistoryDir('/Users/me/code/my-repo', 'project')
    expect(dir).toBe(path.join(os.homedir(), '.manifold', 'history', 'my-repo'))
  })

  it('returns global path when scope is global', () => {
    const dir = resolveShellHistoryDir(
      '/Users/me/.manifold/worktrees/myproject/manifold-oslo',
      'global',
    )
    expect(dir).toBe(path.join(os.homedir(), '.manifold', 'history'))
  })
})
