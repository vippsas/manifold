// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { sanitizeGitHubRepoName } from './github'

describe('sanitizeGitHubRepoName', () => {
  it('passes through valid names unchanged', () => {
    expect(sanitizeGitHubRepoName('my-cool-repo')).toBe('my-cool-repo')
    expect(sanitizeGitHubRepoName('repo_name')).toBe('repo_name')
    expect(sanitizeGitHubRepoName('repo.name')).toBe('repo.name')
    expect(sanitizeGitHubRepoName('RepoName123')).toBe('RepoName123')
  })

  it('replaces & and other special characters with hyphens', () => {
    expect(sanitizeGitHubRepoName('Jacob&Co')).toBe('Jacob-Co')
    expect(sanitizeGitHubRepoName('foo&bar&baz')).toBe('foo-bar-baz')
  })

  it('replaces spaces with hyphens', () => {
    expect(sanitizeGitHubRepoName('my cool repo')).toBe('my-cool-repo')
  })

  it('collapses consecutive hyphens', () => {
    expect(sanitizeGitHubRepoName('a&&b')).toBe('a-b')
    expect(sanitizeGitHubRepoName('a & b')).toBe('a-b')
  })

  it('strips leading and trailing hyphens/periods', () => {
    expect(sanitizeGitHubRepoName('-repo-')).toBe('repo')
    expect(sanitizeGitHubRepoName('.repo.')).toBe('repo')
    expect(sanitizeGitHubRepoName('--repo--')).toBe('repo')
  })

  it('returns fallback for names that become empty', () => {
    expect(sanitizeGitHubRepoName('&&&')).toBe('new-project')
    expect(sanitizeGitHubRepoName('...')).toBe('new-project')
    expect(sanitizeGitHubRepoName('')).toBe('new-project')
  })
})
