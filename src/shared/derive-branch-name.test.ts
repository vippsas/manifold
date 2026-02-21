import { describe, it, expect } from 'vitest'
import { deriveBranchName } from './derive-branch-name'

describe('deriveBranchName', () => {
  it('converts a basic task description to a prefixed kebab-case branch name', () => {
    // "the" is a stopword and gets stripped; remaining 5 words: fix, login, session, timeout, bug
    expect(deriveBranchName('Fix the login session timeout bug')).toBe(
      'manifold/fix-login-session-timeout-bug',
    )
  })

  it('strips common stopwords (the, a, an, in, to, for, etc.)', () => {
    expect(deriveBranchName('Add a feature to the dashboard')).toBe(
      'manifold/add-feature-dashboard',
    )
    expect(deriveBranchName('Create an input for the form')).toBe(
      'manifold/create-input-form',
    )
  })

  it('keeps at most 5 meaningful words', () => {
    // Takes first 5 non-stopwords: refactor, database, query, optimization, layer
    // "manifold/" (9 chars) + "refactor-database-query-optimization-layer" (42 chars) = 51 chars > 40
    // Truncates slug to 31 chars max, then trims trailing partial word
    expect(deriveBranchName('refactor database query optimization layer caching strategy module')).toBe(
      'manifold/refactor-database-query',
    )
  })

  it('truncates at word boundary when exceeding 40-char max length', () => {
    // "manifold/" is 9 chars, leaving 31 chars for the slug
    const result = deriveBranchName('implement authentication middleware validation system')
    expect(result.length).toBeLessThanOrEqual(40)
    expect(result).toMatch(/^manifold\//)
    // Should not end with a hyphen (truncates at word boundary)
    expect(result).not.toMatch(/-$/)
  })

  it('returns empty string for empty input', () => {
    expect(deriveBranchName('')).toBe('')
  })

  it('returns empty string when input contains only stopwords', () => {
    expect(deriveBranchName('the a an in to for of on is it')).toBe('')
  })

  it('strips special characters', () => {
    expect(deriveBranchName('fix bug #123: crash on login!')).toBe(
      'manifold/fix-bug-123-crash-login',
    )
  })

  it('preserves numbers in the branch name', () => {
    expect(deriveBranchName('upgrade node 20 runtime')).toBe(
      'manifold/upgrade-node-20-runtime',
    )
  })

  it('converts input to lowercase', () => {
    expect(deriveBranchName('Fix THE Login BUG')).toBe('manifold/fix-login-bug')
  })

  it('handles extra whitespace gracefully', () => {
    expect(deriveBranchName('  fix   login   bug  ')).toBe('manifold/fix-login-bug')
  })

  it('handles single meaningful word', () => {
    expect(deriveBranchName('refactor')).toBe('manifold/refactor')
  })

  it('handles input that is only whitespace', () => {
    expect(deriveBranchName('   ')).toBe('')
  })
})
