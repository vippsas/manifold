import { describe, it, expect } from 'vitest'
import { buildNlTranslationPrompt } from './nl-command-translator'

describe('buildNlTranslationPrompt shell context', () => {
  it('includes bash in prompt when shell is bash', () => {
    const prompt = buildNlTranslationPrompt({
      query: 'list files',
      terminalOutput: '',
      cwd: '/tmp',
      gitStatus: '',
      os: 'linux',
      shell: 'bash',
    })
    expect(prompt).toContain('Shell: bash')
  })

  it('includes zsh in prompt when shell is zsh', () => {
    const prompt = buildNlTranslationPrompt({
      query: 'list files',
      terminalOutput: '',
      cwd: '/tmp',
      gitStatus: '',
      os: 'linux',
      shell: 'zsh',
    })
    expect(prompt).toContain('Shell: zsh')
  })
})
