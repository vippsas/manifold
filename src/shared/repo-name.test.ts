import { describe, expect, it } from 'vitest'
import { extractGitHubRepoUrlFromText, slugifyRepoName, suggestRepoName } from './repo-name'

describe('repo-name helpers', () => {
  it('slugifies free-form names', () => {
    expect(slugifyRepoName('Fancy Timer App!')).toBe('fancy-timer-app')
  })

  it('uses a GitHub repository name from copied instructions', () => {
    expect(suggestRepoName('Clone https://github.com/sven/canvas-starter.git and continue.')).toBe('canvas-starter')
  })

  it('extracts a cloneable GitHub repository URL from copied instructions', () => {
    expect(extractGitHubRepoUrlFromText('Use git@github.com:sven/canvas-starter.git before continuing.')).toBe(
      'git@github.com:sven/canvas-starter.git'
    )
  })

  it('uses the description when no repository URL is present', () => {
    expect(suggestRepoName('Build a focus timer')).toBe('build-a-focus-timer')
  })

  it('uses the repo name from a `gh repo clone owner/repo` command', () => {
    const instructions = [
      '## 1 - Clone the repository',
      '```bash',
      'gh repo clone acme/widget-store',
      'cd widget-store',
      '```',
    ].join('\n')
    expect(suggestRepoName(instructions)).toBe('widget-store')
  })
})
