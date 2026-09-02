import { describe, expect, it } from 'vitest'
import {
  buildExplorePrompt,
  buildFixPrompt,
  buildGateFixPrompt,
  buildImplementationPrompt,
  buildPlanPrompt,
  buildReviewPrompt,
} from './prompts'
import type { ViolaTaskPlan } from '../../shared/viola'

const TASK: ViolaTaskPlan = {
  id: 'api',
  title: 'API',
  description: 'Fix the API.',
  acceptance: ['API tests pass'],
  purpose: 'implement',
  gates: ['npm test -- src/api'],
}

describe('Viola prompts', () => {
  it('tells the planning brain to delegate, ground the plan in the repo, and tag each task', () => {
    const prompt = buildPlanPrompt('Fix checkout', ['claude', 'codex'])
    expect(prompt).toContain('writes no code itself')
    expect(prompt).toContain('Workers run in parallel in isolated worktrees')
    expect(prompt).toContain('claude, codex')
    expect(prompt).toMatch(/read files in the current repository/i)
    expect(prompt).toContain('"purpose"')
    expect(prompt).toContain('"worker"')
    expect(prompt).toContain('"gates"')
  })

  it('asks implementers to finish with a report and never merge', () => {
    const prompt = buildImplementationPrompt(TASK, '/wt/api/.viola/done')
    expect(prompt).toContain('npm test -- src/api')
    expect(prompt).toMatch(/finish with a (short )?report/i)
    expect(prompt).toContain('Never merge')
  })

  it('keeps explore tasks read-only', () => {
    const prompt = buildExplorePrompt({ ...TASK, purpose: 'explore' }, '/wt/api/.viola/done')
    expect(prompt).toMatch(/edit nothing/i)
    expect(prompt).toContain('file:line')
  })

  it('gives the reviewer the applied diff, its stat, and the implementer\'s unverified report', () => {
    const prompt = buildReviewPrompt(TASK, {
      diff: 'diff --git a/file b/file',
      stat: ' file | 2 +-',
      report: 'Added the missing guard and ran npm test.',
      verdictPath: '/wt/review/.viola/review-api.json',
    })
    expect(prompt).toContain('applied to your current worktree')
    expect(prompt).toContain('file | 2 +-')
    expect(prompt).toContain('diff --git a/file b/file')
    expect(prompt).toContain('Added the missing guard and ran npm test.')
    expect(prompt).toMatch(/unverified/i)
    expect(prompt).toContain('"passed"')
  })

  it('never truncates a large diff silently; it points the reviewer at git diff instead', () => {
    const prompt = buildReviewPrompt(TASK, {
      diff: 'x'.repeat(100_000), stat: ' big | 1 +', report: '', verdictPath: '/wt/review/.viola/review-api.json',
    })
    expect(prompt).not.toContain('truncated')
    expect(prompt).not.toContain('x'.repeat(1000))
    expect(prompt).toMatch(/run `git diff` in your worktree/i)
  })

  it('sends gate output back to the implementer verbatim', () => {
    const prompt = buildGateFixPrompt(TASK, 'npm test -- src/api', 'FAIL src/api.test.ts > rejects bad input', '/wt/api/.viola/done')
    expect(prompt).toContain('npm test -- src/api')
    expect(prompt).toContain('FAIL src/api.test.ts > rejects bad input')
    expect(prompt).toContain('Never merge')
  })

  it('tells every worker which file ends its turn, since nothing else is read as finished', () => {
    const done = '/wt/api/.viola/done'
    const prompts = [
      buildImplementationPrompt(TASK, done),
      buildExplorePrompt({ ...TASK, purpose: 'explore' }, done),
      buildGateFixPrompt(TASK, 'npm test', 'FAIL', done),
      buildFixPrompt(TASK, ['Add a test.'], done),
    ]
    for (const prompt of prompts) {
      expect(prompt).toContain(done)
      expect(prompt).toMatch(/write the single word DONE/i)
      expect(prompt).toMatch(/timeout/i)
    }
  })

  it('makes the reviewer\'s verdict file double as its completion signal', () => {
    const verdictPath = '/wt/review/.viola/review-api.json'
    const prompt = buildReviewPrompt(TASK, { diff: 'd', stat: 's', report: '', verdictPath })

    expect(prompt).toContain(verdictPath)
    expect(prompt).toMatch(/how Viola learns you have\s+finished/i)
  })

  it('sends blocking review findings back to the implementer', () => {
    const prompt = buildFixPrompt(TASK, ['Add the missing regression test.'], '/wt/api/.viola/done')
    expect(prompt).toContain('Add the missing regression test.')
    expect(prompt).toContain('Never merge')
  })
})
