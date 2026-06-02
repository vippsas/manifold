import { describe, it, expect } from 'vitest'
import { buildWorkingSetArgs } from './working-set-args'

describe('buildWorkingSetArgs', () => {
  const dirs = ['/w/web', '/w/shared']

  it('returns empty when there are no extra dirs', () => {
    expect(buildWorkingSetArgs('claude', [])).toEqual([])
    expect(buildWorkingSetArgs('gemini', [])).toEqual([])
  })
  it('claude uses one variadic --add-dir', () => {
    expect(buildWorkingSetArgs('claude', dirs)).toEqual(['--add-dir', '/w/web', '/w/shared'])
  })
  it('ollama-claude behaves like claude', () => {
    expect(buildWorkingSetArgs('ollama-claude', dirs)).toEqual(['--add-dir', '/w/web', '/w/shared'])
  })
  it('codex repeats --add-dir per dir', () => {
    expect(buildWorkingSetArgs('codex', dirs)).toEqual(['--add-dir', '/w/web', '--add-dir', '/w/shared'])
  })
  it('ollama-codex behaves like codex', () => {
    expect(buildWorkingSetArgs('ollama-codex', dirs)).toEqual(['--add-dir', '/w/web', '--add-dir', '/w/shared'])
  })
  it('copilot repeats --add-dir per dir', () => {
    expect(buildWorkingSetArgs('copilot', dirs)).toEqual(['--add-dir', '/w/web', '--add-dir', '/w/shared'])
  })
  it('gemini uses a comma-joined --include-directories', () => {
    expect(buildWorkingSetArgs('gemini', dirs)).toEqual(['--include-directories', '/w/web,/w/shared'])
  })
  it('unknown runtime falls back to no extra args (single-root)', () => {
    expect(buildWorkingSetArgs('mystery', dirs)).toEqual([])
  })
})
