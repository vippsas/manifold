import { describe, expect, it } from 'vitest'
import { parsePlanResponse, parseReviewResponse } from './planner'

describe('Viola planner protocol', () => {
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
        { id: 'api-tests', title: 'API tests', description: 'Cover the API edge case.', acceptance: ['API tests pass'], purpose: 'implement', gates: [] },
        { id: 'ui-state', title: 'UI state', description: 'Fix the empty state.', acceptance: ['Renderer test passes'], purpose: 'implement', gates: [] },
      ],
    })
  })

  it('keeps the purpose, suggested worker, and gate commands of each task', () => {
    const parsed = parsePlanResponse(JSON.stringify({
      summary: 'Look then fix',
      tasks: [
        { title: 'Why it flakes', description: 'Find the flake.', acceptance: ['Root cause named'], purpose: 'explore', worker: 'codex' },
        { title: 'Fix', description: 'Fix it.', acceptance: ['Test passes'], worker: 'not-a-worker', gates: ['npm test -- src/x', ''] },
      ],
    }))
    expect(parsed).toMatchObject({
      tasks: [
        { id: 'why-it-flakes', purpose: 'explore', worker: 'codex', gates: [] },
        { id: 'fix', purpose: 'implement', gates: ['npm test -- src/x'] },
      ],
    })
    expect((parsed as { tasks: { worker?: string }[] }).tasks[1].worker).toBeUndefined()
  })

  it('rejects an unknown task purpose', () => {
    expect(parsePlanResponse(JSON.stringify({
      summary: 'bad',
      tasks: [{ title: 'T', description: 'D', acceptance: ['A'], purpose: 'deploy' }],
    }))).toHaveProperty('error')
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
