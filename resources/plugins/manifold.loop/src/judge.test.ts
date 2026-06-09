import { describe, it, expect } from 'vitest'
import { buildJudgePrompt, extractScore, createJudge } from './judge'

describe('extractScore', () => {
  it('reads the tagged FINAL_SCORE line', () => {
    expect(extractScore('reasoning...\nFINAL_SCORE: 7', 10)).toBe(7)
  })
  it('clamps to [0, maxScore]', () => {
    expect(extractScore('FINAL_SCORE: 99', 10)).toBe(10)
    expect(extractScore('FINAL_SCORE: -4', 10)).toBe(0)
  })
  it('falls back to the last number', () => {
    expect(extractScore('the score is 5', 10)).toBe(5)
  })
  it('returns null when there is no number', () => {
    expect(extractScore('no number', 10)).toBeNull()
  })
})

describe('buildJudgePrompt', () => {
  it('includes the rubric, task spec, and diff', () => {
    const p = buildJudgePrompt({ rubric: 'Cleanliness', maxScore: 10, evalStdout: 'built', diff: 'diff x', hasEvalCommand: true, programSpec: 'make it clean' })
    expect(p).toContain('Cleanliness')
    expect(p).toContain('make it clean')
    expect(p).toContain('diff x')
    expect(p).toContain('FINAL_SCORE:')
  })
  it('omits eval mentions when no eval command', () => {
    const p = buildJudgePrompt({ rubric: 'r', maxScore: 5, evalStdout: '', diff: 'd', hasEvalCommand: false, programSpec: 's' })
    expect(p).toContain('NO EVAL COMMAND IS CONFIGURED')
  })
})

describe('createJudge', () => {
  const fakeLm = (text: string) => ({ selectChatModels: async () => [{ id: 'm', sendRequest: async () => ({ text }) }] })

  it('returns the parsed score from the model output', async () => {
    const judge = createJudge(fakeLm('FINAL_SCORE: 8') as never)
    const r = await judge.judge({ sessionId: 's', rubric: 'r', maxScore: 10, evalStdout: 'o', diff: 'd', hasEvalCommand: true, program: 'p' }, new AbortController().signal)
    expect(r.score).toBe(8)
  })

  it('selects the model for the pinned request session, not the active one', async () => {
    const seen: Array<string | undefined> = []
    const lm = { selectChatModels: async (sessionId?: string) => { seen.push(sessionId); return [{ id: 'm', sendRequest: async () => ({ text: 'FINAL_SCORE: 5' }) }] } }
    const judge = createJudge(lm as never)
    await judge.judge({ sessionId: 'pinned-session', rubric: 'r', maxScore: 10, evalStdout: '', diff: 'd', hasEvalCommand: false, program: 'p' }, new AbortController().signal)
    expect(seen).toEqual(['pinned-session'])
  })

  it('fails when no model is available', async () => {
    const judge = createJudge({ selectChatModels: async () => [] } as never)
    const r = await judge.judge({ sessionId: 's', rubric: 'r', maxScore: 10, evalStdout: '', diff: 'd', hasEvalCommand: false, program: 'p' }, new AbortController().signal)
    expect(r.failure).toMatch(/no language model/i)
  })

  it('returns failure with rawOutput when the model gives no number', async () => {
    const judge = createJudge(fakeLm('I cannot decide') as never)
    const r = await judge.judge({ sessionId: 's', rubric: 'r', maxScore: 10, evalStdout: '', diff: 'd', hasEvalCommand: false, program: 'p' }, new AbortController().signal)
    expect(r.failure).toBeTruthy()
    expect(r.rawOutput).toContain('cannot decide')
  })

  it('aborts early when the signal is already aborted', async () => {
    const judge = createJudge(fakeLm('FINAL_SCORE: 8') as never)
    const ac = new AbortController(); ac.abort()
    const r = await judge.judge({ sessionId: 's', rubric: 'r', maxScore: 10, evalStdout: '', diff: 'd', hasEvalCommand: false, program: 'p' }, ac.signal)
    expect(r.failure).toMatch(/aborted/i)
  })
})
