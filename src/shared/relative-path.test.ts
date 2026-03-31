import { describe, expect, it } from 'vitest'
import { getRelativePath } from './relative-path'

describe('getRelativePath', () => {
  it('returns a nested path relative to the worktree root', () => {
    expect(getRelativePath('/repo/src/app.ts', '/repo')).toBe('src/app.ts')
  })

  it('returns dot for the root directory itself', () => {
    expect(getRelativePath('/repo', '/repo')).toBe('.')
  })

  it('walks up when the path is outside the worktree root', () => {
    expect(getRelativePath('/Users/me/shared/docs/readme.md', '/Users/me/repo')).toBe('../shared/docs/readme.md')
  })
})
