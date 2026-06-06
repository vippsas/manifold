import { describe, it, expect } from 'vitest'
import { buildImproveInstruction } from './improve-instruction'

describe('buildImproveInstruction', () => {
  it('rewrites an existing draft and forbids questions/fences', () => {
    const s = buildImproveInstruction({ draft: 'make it fast', evalCommand: 'npm bench', targetGlobs: 'src/**' })
    expect(s).toContain('make it fast')
    expect(s).toMatch(/Do NOT ask clarifying questions/i)
    expect(s).toMatch(/no code fences/i)
  })
  it('writes a starter spec from eval/globs when no draft', () => {
    const s = buildImproveInstruction({ draft: '', evalCommand: 'npm bench', targetGlobs: 'src/**' })
    expect(s).toContain('npm bench')
    expect(s).toContain('src/**')
  })
})
