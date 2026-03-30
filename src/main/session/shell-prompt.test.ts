import { describe, it, expect, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { buildShellEnv, buildWelcomeMessage, createManifoldZdotdir } from './shell-prompt'

describe('buildShellEnv', () => {
  it('sets MANIFOLD env vars from worktree path', () => {
    const env = buildShellEnv('/Users/me/.manifold/worktrees/myproject/manifold-oslo')
    expect(env.MANIFOLD_WORKTREE).toBe('1')
    expect(env.MANIFOLD_BRANCH).toBe('manifold/oslo')
    expect(env.MANIFOLD_AGENT_NAME).toBe('oslo')
  })

  it('handles paths without manifold- prefix gracefully', () => {
    const env = buildShellEnv('/some/random/path')
    expect(env.MANIFOLD_WORKTREE).toBe('1')
    expect(env.MANIFOLD_AGENT_NAME).toBe('path')
    expect(env.MANIFOLD_BRANCH).toBe('manifold/path')
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

  afterEach(() => {
    if (zdotdir) {
      fs.rmSync(zdotdir, { recursive: true, force: true })
      zdotdir = null
    }
  })

  it('creates a temp directory with a .zshrc that sets PROMPT', () => {
    zdotdir = createManifoldZdotdir('oslo')
    expect(fs.existsSync(zdotdir)).toBe(true)
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).toContain('ZDOTDIR_ORIG')
    expect(rc).toContain('oslo')
    expect(rc).toContain('PROMPT=')
  })

  it('configures HISTFILE when historyDir is provided', () => {
    zdotdir = createManifoldZdotdir('oslo', '/tmp/test-history')
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).toContain('HISTFILE="/tmp/test-history/.zsh_history"')
    expect(rc).toContain('HISTSIZE=10000')
    expect(rc).toContain('SAVEHIST=10000')
    expect(rc).toContain('setopt INC_APPEND_HISTORY')
    expect(rc).toContain('setopt HIST_IGNORE_DUPS')
  })

  it('does not include HISTFILE when historyDir is undefined', () => {
    zdotdir = createManifoldZdotdir('oslo')
    const rc = fs.readFileSync(path.join(zdotdir, '.zshrc'), 'utf-8')
    expect(rc).not.toContain('HISTFILE')
  })
})
