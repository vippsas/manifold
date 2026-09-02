import { describe, expect, it } from 'vitest'
import { buildPlanPrompt, parsePlanResponse, parseReviewResponse } from './planner'

describe('Viola planner protocol', () => {
  it('tells the planning brain to delegate without writing code', () => {
    const prompt = buildPlanPrompt('Fix checkout', ['claude', 'codex'])
    expect(prompt).toContain('writes no code itself')
    expect(prompt).toContain('Workers run in parallel in isolated worktrees')
    expect(prompt).toContain('claude, codex')
  })

  it('parses a bounded independent task plan', () => {
    expect(parsePlanResponse(JSON.stringify({
      summary: 'Two independent fixes',
      tasks: [
        { title: 'API tests', description: 'Cover the API edge case.', acceptance: ['API tests pass'] },
        { title: 'UI state', description: 'Fix the empty state.', acceptance: ['Renderer test passes'] },
      ],
    }))).toEqual({
      summary: 'Two independent fixes',
      tasks: [
        { id: 'api-tests', title: 'API tests', description: 'Cover the API edge case.', acceptance: ['API tests pass'] },
        { id: 'ui-state', title: 'UI state', description: 'Fix the empty state.', acceptance: ['Renderer test passes'] },
      ],
    })
  })

  it('rejects empty and oversized plans', () => {
    expect(parsePlanResponse('{"summary":"none","tasks":[]}')).toHaveProperty('error')
    const tasks = Array.from({ length: 5 }, (_, index) => ({
      title: `Task ${index}`,
      description: 'Do it.',
      acceptance: ['It works'],
    }))
    expect(parsePlanResponse(JSON.stringify({ summary: 'too many', tasks }))).toHaveProperty('error')
  })

  it('makes blocking findings fail a reviewer verdict', () => {
    expect(parseReviewResponse('{"passed":true,"blocking":["Missing test"],"nonBlocking":[]}'))
      .toEqual({ passed: false, blocking: ['Missing test'], nonBlocking: [] })
  })
})
