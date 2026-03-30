import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}))

import * as fs from 'node:fs'
import { buildSuggestionPrompt, readRecentHistory, parseZshHistoryLine } from './shell-suggestion'

const mockExistsSync = vi.mocked(fs.existsSync)
const mockReadFileSync = vi.mocked(fs.readFileSync)

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
})
