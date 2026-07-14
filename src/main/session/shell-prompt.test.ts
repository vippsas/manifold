import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildShellEnv, buildWelcomeMessage, createManifoldZdotdir, detectShell, createManifoldBashRcFile } from './shell-prompt'
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

  // Empty user zdotdir isolates spawned shells from the dev machine's zshrc;
  // the returned segments file path is never written, so baked seeds apply.
  function isolateUserZdotdir(): { segmentsFile: string } {
    userZdotdir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-user-zdotdir-'))
    fs.writeFileSync(path.join(userZdotdir, '.zshrc'), '', 'utf-8')
    process.env.ZDOTDIR = userZdotdir
    return { segmentsFile: path.join(userZdotdir, 'segments.zsh') }
  }

  function renderPrompt(dir: string): string {
    const result = spawnSync('zsh', ['-i', '-c', 'print -r -- "prompt=$PROMPT"'], {
      env: { ...process.env, ZDOTDIR: dir, PATH: '/usr/bin:/bin', KUBECONFIG: '/nonexistent/kubeconfig' },
      encoding: 'utf-8',
    })
    expect(result.status).toBe(0)
    return result.stdout
  }

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

  itIfZsh('shows repository and agent in the prompt when both are known', () => {
    const { segmentsFile } = isolateUserZdotdir()
    zdotdir = createManifoldZdotdir({ agentName: 'oslo', repoName: 'myproject', segmentsFile })
    expect(renderPrompt(zdotdir)).toContain('prompt=%F{16}myproject%f [oslo] %F{white}❯%f ')
  })

  itIfZsh('falls back to the agent-only prompt when the repo matches the agent name', () => {
    const { segmentsFile } = isolateUserZdotdir()
    zdotdir = createManifoldZdotdir({ agentName: 'myrepo', repoName: 'myrepo', segmentsFile })
    expect(renderPrompt(zdotdir)).toContain('prompt=%F{16}myrepo%f %F{white}❯%f ')
  })

  itIfZsh('renders only the repository when the agent segment is disabled', () => {
    const { segmentsFile } = isolateUserZdotdir()
    zdotdir = createManifoldZdotdir({
      agentName: 'oslo',
      repoName: 'myproject',
      segments: { repo: true, agent: false, k8sContext: false, k8sNamespace: false },
      segmentsFile,
    })
    expect(renderPrompt(zdotdir)).toContain('prompt=%F{16}myproject%f %F{white}❯%f ')
  })

  itIfZsh('renders only the agent when the repo segment is disabled', () => {
    const { segmentsFile } = isolateUserZdotdir()
    zdotdir = createManifoldZdotdir({
      agentName: 'oslo',
      repoName: 'myproject',
      segments: { repo: false, agent: true, k8sContext: false, k8sNamespace: false },
      segmentsFile,
    })
    expect(renderPrompt(zdotdir)).toContain('prompt=%F{16}oslo%f %F{white}❯%f ')
  })

  itIfZsh('renders a bare glyph prompt when all segments are disabled', () => {
    const { segmentsFile } = isolateUserZdotdir()
    zdotdir = createManifoldZdotdir({
      agentName: 'oslo',
      repoName: 'myproject',
      segments: { repo: false, agent: false, k8sContext: false, k8sNamespace: false },
      segmentsFile,
    })
    expect(renderPrompt(zdotdir)).toContain('prompt=%F{white}❯%f ')
  })

  it('seeds the segment toggles from spawn-time settings and refreshes via precmd', () => {
    zdotdir = createManifoldZdotdir({
      agentName: 'oslo',
      repoName: 'myproject',
      segments: { repo: true, agent: false, k8sContext: true, k8sNamespace: false },
    })
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).toContain('typeset -g _manifold_seg_repo=1')
    expect(rc).toContain('typeset -g _manifold_seg_agent=0')
    expect(rc).toContain('typeset -g _manifold_seg_k8s_ctx=1')
    expect(rc).toContain('typeset -g _manifold_seg_k8s_ns=0')
    expect(rc).toContain('kubectl config current-context')
    expect(rc).toContain('add-zsh-hook precmd _manifold_prompt_refresh')
  })

  it('points the generated rc at the shared segments file by default', () => {
    zdotdir = createManifoldZdotdir({ agentName: 'oslo', repoName: 'myproject' })
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).toContain(path.join(os.homedir(), '.manifold', 'shell-prompt-segments.zsh'))
  })

  itIfZsh('falls back to the static segments when kubectl is unavailable', () => {
    const { segmentsFile } = isolateUserZdotdir()

    zdotdir = createManifoldZdotdir({
      agentName: 'oslo',
      repoName: 'myproject',
      segments: { repo: true, agent: true, k8sContext: true, k8sNamespace: true },
      segmentsFile,
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
    zdotdir = createManifoldZdotdir({
      agentName: 'oslo',
      repoName: 'myproject',
      segmentsFile: path.join(userZdotdir, 'segments.zsh'),
    })

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

describe('detectShell', () => {
  it('returns zsh when SHELL is /bin/zsh', () => {
    expect(detectShell('/bin/zsh')).toBe('zsh')
  })

  it('returns bash when SHELL is /bin/bash', () => {
    expect(detectShell('/bin/bash')).toBe('bash')
  })

  it('returns bash when SHELL is /usr/bin/bash', () => {
    expect(detectShell('/usr/bin/bash')).toBe('bash')
  })

  it('returns other for unknown shells', () => {
    expect(detectShell('/bin/fish')).toBe('other')
  })
})

describe('createManifoldBashRcFile', () => {
  it('creates a temp dir containing a .bashrc', () => {
    const dir = createManifoldBashRcFile({ agentName: 'oslo', repoName: 'myrepo' })
    expect(fs.existsSync(path.join(dir, '.bashrc'))).toBe(true)
    fs.rmSync(dir, { recursive: true })
  })

  it('.bashrc sources user .bashrc and sets PS1', () => {
    const dir = createManifoldBashRcFile({ agentName: 'oslo', repoName: 'myrepo' })
    const rc = fs.readFileSync(path.join(dir, '.bashrc'), 'utf-8')
    expect(rc).toContain('~/.bashrc')
    expect(rc).toContain('PS1=')
    expect(rc).toContain('oslo')
    fs.rmSync(dir, { recursive: true })
  })

  const bashAvailable = spawnSync('bash', ['-c', 'exit 0']).status === 0
  const itIfBash = bashAvailable ? it : it.skip

  // Repo names come from directory names, which can be attacker-influenced.
  // Bash's default `promptvars` re-expands PS1 at every render, so a name
  // containing $(...) or backticks would execute as a command. Guard against it.
  itIfBash('does not execute a command substitution embedded in the repo name', () => {
    const marker = path.join(os.tmpdir(), `manifold-ps1-injection-${process.pid}-marker`)
    fs.rmSync(marker, { force: true })
    const dir = createManifoldBashRcFile({ agentName: 'oslo', repoName: `$(touch ${marker})` })
    try {
      // Interactive bash renders PS1 once before reading `exit`.
      spawnSync('bash', ['--rcfile', path.join(dir, '.bashrc'), '-i'], {
        input: 'exit\n',
        env: { ...process.env, PATH: '/usr/bin:/bin' },
        encoding: 'utf-8',
        timeout: 5000,
      })
      expect(fs.existsSync(marker)).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(marker, { force: true })
    }
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
