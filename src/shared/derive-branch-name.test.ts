import { describe, it, expect } from 'vitest'
import { deriveBranchName } from './derive-branch-name'

describe('deriveBranchName', () => {
  it('converts a basic task description to a prefixed kebab-case branch name', () => {
    // "the" is a stopword and gets stripped; remaining 5 words: fix, login, session, timeout, bug
    expect(deriveBranchName('Fix the login session timeout bug', 'my-app')).toBe(
      'my-app/fix-login-session-timeout-bug',
    )
  })

  it('strips common stopwords (the, a, an, in, to, for, etc.)', () => {
    expect(deriveBranchName('Add a feature to the dashboard', 'my-app')).toBe(
      'my-app/add-feature-dashboard',
    )
    expect(deriveBranchName('Create an input for the form', 'my-app')).toBe(
      'my-app/create-input-form',
    )
  })

  it('keeps at most 5 meaningful words', () => {
    // Takes first 5 non-stopwords: refactor, database, query, optimization, layer
    // "my-app/" (7 chars) + "refactor-database-query-optimization-layer" (42 chars) = 49 chars > 40
    // Truncates slug to 33 chars max, then trims trailing partial word
    expect(deriveBranchName('refactor database query optimization layer caching strategy module', 'my-app')).toBe(
      'my-app/refactor-database-query',
    )
  })

  it('truncates at word boundary when exceeding 40-char max length', () => {
    // "my-app/" is 7 chars, leaving 33 chars for the slug
    const result = deriveBranchName('implement authentication middleware validation system', 'my-app')
    expect(result.length).toBeLessThanOrEqual(40)
    expect(result).toMatch(/^my-app\//)
    // Should not end with a hyphen (truncates at word boundary)
    expect(result).not.toMatch(/-$/)
  })

  it('returns empty string for empty input', () => {
    expect(deriveBranchName('', 'my-app')).toBe('')
  })

  it('returns empty string when input contains only stopwords', () => {
    expect(deriveBranchName('the a an in to for of on is it', 'my-app')).toBe('')
  })

  it('strips special characters', () => {
    expect(deriveBranchName('fix bug #123: crash on login!', 'my-app')).toBe(
      'my-app/fix-bug-123-crash-login',
    )
  })

  it('preserves numbers in the branch name', () => {
    expect(deriveBranchName('upgrade node 20 runtime', 'my-app')).toBe(
      'my-app/upgrade-node-20-runtime',
    )
  })

  it('converts input to lowercase', () => {
    expect(deriveBranchName('Fix THE Login BUG', 'my-app')).toBe('my-app/fix-login-bug')
  })

  it('handles extra whitespace gracefully', () => {
    expect(deriveBranchName('  fix   login   bug  ', 'my-app')).toBe('my-app/fix-login-bug')
  })

  it('handles single meaningful word', () => {
    expect(deriveBranchName('refactor', 'my-app')).toBe('my-app/refactor')
  })

  it('handles input that is only whitespace', () => {
    expect(deriveBranchName('   ', 'my-app')).toBe('')
  })

  it('uses repo name as branch prefix', () => {
    expect(deriveBranchName('fix login bug', 'manifold')).toBe('manifold/fix-login-bug')
    expect(deriveBranchName('fix login bug', 'cool-project')).toBe('cool-project/fix-login-bug')
  })

  it('lowercases the repo name', () => {
    expect(deriveBranchName('fix bug', 'MyApp')).toBe('myapp/fix-bug')
  })
})
