import { describe, expect, it } from 'vitest'
import { extractGitHubRepoUrlFromText, slugifyRepoName, suggestRepoName } from './repo-name'

describe('repo-name helpers', () => {
  it('slugifies free-form names', () => {
    expect(slugifyRepoName('Fancy Timer App!')).toBe('fancy-timer-app')
  })

  it.each([
    ['Café Münster', 'cafe-munster'],
    ['Señor Niño', 'senor-nino'],
    ['Ålesund', 'alesund'],
    ['A\u030Alesund', 'alesund'],
    ['Ærø Åpen', 'aero-apen'],
    ['Fancy Timer App!', 'fancy-timer-app'],
  ])('slugifies %j as %j', (input, expected) => {
    expect(slugifyRepoName(input)).toBe(expected)
  })

  it('suggests a repo name without diacritics', () => {
    expect(suggestRepoName('Café')).toBe('cafe')
  })

  it('limits slugs to 60 characters without leading or trailing hyphens', () => {
    expect(slugifyRepoName(`!${'a'.repeat(59)} café!`)).toBe('a'.repeat(59))
    expect(slugifyRepoName('é'.repeat(61))).toBe('e'.repeat(60))
  })

  it('uses the fallback for an empty description', () => {
    expect(suggestRepoName('')).toBe('new-project')
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

  it('does not truncate repo names containing dots', () => {
    expect(extractGitHubRepoUrlFromText('Clone https://github.com/acme/next.js to start.')).toBe(
      'https://github.com/acme/next.js.git'
    )
    expect(suggestRepoName('Clone https://github.com/acme/next.js to start.')).toBe('next-js')
  })

  it('still strips an explicit .git suffix for dotted repo names', () => {
    expect(extractGitHubRepoUrlFromText('git@github.com:acme/next.js.git here')).toBe(
      'git@github.com:acme/next.js.git'
    )
  })

  it('treats a trailing sentence period as a boundary, not part of a dotted name', () => {
    expect(extractGitHubRepoUrlFromText('Go to https://github.com/acme/next.js. Next step.')).toBe(
      'https://github.com/acme/next.js.git'
    )
  })

  it('does not truncate dotted repo names from a `gh repo clone` command', () => {
    expect(suggestRepoName('gh repo clone acme/next.js')).toBe('next-js')
  })
})
