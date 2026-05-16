import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

const execFileMock = vi.hoisted(() => (
  vi.fn((_file: string, _args: string[], _options: unknown, callback: (err: Error | null, stdout: string) => void) => {
    callback(null, '## main\n')
  })
))

vi.mock('node:child_process', () => ({
  default: { execFile: execFileMock },
  execFile: execFileMock,
}))

vi.mock('../agent/runtimes', () => ({
  getRuntimeById: vi.fn(() => ({
    id: 'codex',
    aiModelArgs: [],
  })),
}))

import * as fs from 'node:fs'
import { getRuntimeById } from '../agent/runtimes'
import type { InternalSession } from './session-types'
import { NlInputBuffer } from './nl-command-translator'
import {
  buildSuggestionPrompt,
  clearGhostText,
  dismissSuggestion,
  injectGhostText,
  parseZshHistoryLine,
  predictNextCommand,
  readRecentHistory,
} from './shell-suggestion'

const mockExistsSync = vi.mocked(fs.existsSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)

function createShellSession(): InternalSession {
  return {
    id: 'session-1',
    projectId: 'project-1',
    runtimeId: '__shell__',
    branchName: 'main',
    worktreePath: '/tmp/app',
    status: 'running',
    pid: 123,
    ptyId: 'pty-1',
    outputBuffer: '',
    additionalDirs: [],
    noWorktree: true,
    nlInputBuffer: new NlInputBuffer(),
  }
}

describe('parseZshHistoryLine', () => {
  it('strips extended history timestamp format', () => {
    expect(parseZshHistoryLine(': 1711234567:0;echo hello')).toBe('echo hello')
  })

  it('returns plain lines as-is', () => {
    expect(parseZshHistoryLine('git status')).toBe('git status')
  })

  it('returns null for empty lines', () => {
    expect(parseZshHistoryLine('')).toBeNull()
    expect(parseZshHistoryLine('   ')).toBeNull()
  })
})

describe('readRecentHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads last N commands from history file', () => {
    const content = [
      ': 1711234560:0;git add .',
      ': 1711234561:0;git commit -m "init"',
      ': 1711234562:0;npm test',
      ': 1711234563:0;npm run build',
      ': 1711234564:0;git push',
    ].join('\n')

    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(content)

    const result = readRecentHistory('/tmp/test/.zsh_history', 3)
    expect(result).toEqual(['npm test', 'npm run build', 'git push'])
  })

  it('returns empty array when file does not exist', () => {
    mockExistsSync.mockReturnValue(false)

    const result = readRecentHistory('/nonexistent/.zsh_history', 20)
    expect(result).toEqual([])
  })
})

describe('buildSuggestionPrompt', () => {
  it('includes history and git status in prompt', () => {
    const prompt = buildSuggestionPrompt(
      ['git add .', 'git commit -m "fix"'],
      'main\n M src/index.ts',
      'my-project',
    )
    expect(prompt).toContain('git add .')
    expect(prompt).toContain('git commit -m "fix"')
    expect(prompt).toContain('M src/index.ts')
    expect(prompt).toContain('my-project')
    expect(prompt).toContain('single most likely next command')
  })

  it('handles empty history gracefully', () => {
    const prompt = buildSuggestionPrompt([], 'main\n', 'my-project')
    expect(prompt).toContain('(no recent commands)')
    expect(prompt).toContain('single most likely next command')
  })

  it('includes terminal output when provided', () => {
    const prompt = buildSuggestionPrompt(
      ['git status'],
      '## manifold/sandnes',
      'my-project',
      'On branch manifold/sandnes\nnothing to commit, working tree clean',
    )
    expect(prompt).toContain('Recent terminal output:')
    expect(prompt).toContain('nothing to commit, working tree clean')
  })

  it('omits terminal output block when not provided', () => {
    const prompt = buildSuggestionPrompt(
      ['git status'],
      '## manifold/sandnes',
      'my-project',
    )
    expect(prompt).not.toContain('Recent terminal output:')
  })
})

describe('dismissSuggestion', () => {
  it('cancels in-flight suggestions even before ghost text is rendered', () => {
    const session = createShellSession()
    const ptyPool = { pushOutput: vi.fn() }
    session.shellSuggestion = { activeSuggestion: null, pending: true }

    dismissSuggestion(session, ptyPool as never)

    expect(session.shellSuggestion).toEqual({ activeSuggestion: null, pending: false, ghostVisible: false })
    expect(ptyPool.pushOutput).not.toHaveBeenCalled()
  })

  it('clears visible pending ghost text when dismissed', () => {
    const session = createShellSession()
    const ptyPool = { pushOutput: vi.fn() }
    session.shellSuggestion = { activeSuggestion: null, pending: true, ghostVisible: true }

    dismissSuggestion(session, ptyPool as never)

    expect(ptyPool.pushOutput).toHaveBeenCalledWith('pty-1', '\x1b[K')
    expect(session.shellSuggestion).toEqual({ activeSuggestion: null, pending: false, ghostVisible: false })
  })
})

describe('ghost text rendering', () => {
  it('draws ghost text inline and moves the cursor back without save/restore cursor state', () => {
    const ptyPool = { pushOutput: vi.fn() }

    injectGhostText(ptyPool as never, 'pty-1', 'git status')

    expect(ptyPool.pushOutput).toHaveBeenCalledWith('pty-1', '\x1b[2mgit status\x1b[22m\x1b[10D')
  })

  it('clears from the live cursor instead of restoring a stale saved cursor', () => {
    const ptyPool = { pushOutput: vi.fn() }

    clearGhostText(ptyPool as never, 'pty-1')

    expect(ptyPool.pushOutput).toHaveBeenCalledWith('pty-1', '\x1b[K')
  })
})

describe('predictNextCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses Codex as the shell suggestion runtime', async () => {
    const session = createShellSession()
    const ptyPool = { pushOutput: vi.fn() }
    const gitOps = { aiGenerate: vi.fn().mockResolvedValue('npm test') }

    await predictNextCommand(session, ptyPool as never, gitOps as never)

    expect(getRuntimeById).toHaveBeenCalledWith('codex')
    expect(gitOps.aiGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'codex' }),
      expect.any(String),
      '/tmp/app',
      ['--model', 'gpt-5.4-mini'],
      { timeoutMs: 30_000, silent: true },
    )
    expect(ptyPool.pushOutput).toHaveBeenNthCalledWith(1, 'pty-1', expect.stringContaining('...'))
    expect(ptyPool.pushOutput).toHaveBeenNthCalledWith(2, 'pty-1', '\x1b[K')
    expect(ptyPool.pushOutput).toHaveBeenNthCalledWith(3, 'pty-1', expect.stringContaining('npm test'))
    expect(session.shellSuggestion).toEqual({
      activeSuggestion: 'npm test',
      pending: false,
      ghostVisible: true,
    })
  })

  it('falls back to git status when Codex returns an empty suggestion', async () => {
    const session = createShellSession()
    const ptyPool = { pushOutput: vi.fn() }
    const gitOps = { aiGenerate: vi.fn().mockResolvedValue('\n') }

    await predictNextCommand(session, ptyPool as never, gitOps as never)

    expect(ptyPool.pushOutput).toHaveBeenNthCalledWith(2, 'pty-1', '\x1b[K')
    expect(ptyPool.pushOutput).toHaveBeenNthCalledWith(3, 'pty-1', expect.stringContaining('git status'))
    expect(session.shellSuggestion?.activeSuggestion).toBe('git status')
  })
})
