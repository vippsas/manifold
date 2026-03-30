import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

vi.mock('../agent/runtimes', () => ({
  getRuntimeById: vi.fn(() => ({
    id: 'claude',
    aiModelArgs: [],
  })),
}))

import * as fs from 'node:fs'
import type { InternalSession } from './session-types'
import { NlInputBuffer } from './nl-command-translator'
import { buildSuggestionPrompt, readRecentHistory, parseZshHistoryLine, dismissSuggestion } from './shell-suggestion'

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

    expect(session.shellSuggestion).toEqual({ activeSuggestion: null, pending: false })
    expect(ptyPool.pushOutput).not.toHaveBeenCalled()
  })
})
