import { describe, it, expect } from 'vitest'
import { configFromForm, formFromConfig, describeMetric, DEFAULT_FORM } from './helpers'
import type { LoopConfig } from '../types'

describe('configFromForm', () => {
  it('rejects an empty program', () => {
    const r = configFromForm('s1', { ...DEFAULT_FORM, program: '  ', metricKind: 'exit-code', evalCommand: 'x' })
    expect('error' in r && r.error).toMatch(/program/i)
  })
  it('builds an llm-judge config without an eval command', () => {
    const r = configFromForm('s1', { ...DEFAULT_FORM, program: 'do it', metricKind: 'llm-judge', evalCommand: '', judgeRubric: 'r', judgeMaxScore: '10' })
    expect('error' in r).toBe(false)
    if (!('error' in r)) { expect(r.metric.kind).toBe('llm-judge'); expect(r.sessionId).toBe('s1') }
  })
  it('requires eval command for non-judge metrics', () => {
    const r = configFromForm('s1', { ...DEFAULT_FORM, program: 'p', metricKind: 'exit-code', evalCommand: '' })
    expect('error' in r && r.error).toMatch(/evalCommand/i)
  })
})

describe('formFromConfig round-trips', () => {
  it('preserves a stdout-regex config', () => {
    const cfg: LoopConfig = { sessionId: 's1', program: 'p', targetGlobs: ['src/**'], evalCommand: 'npm t', metric: { kind: 'stdout-regex', pattern: 'ms=(\\d+)', direction: 'minimize' }, budgetSeconds: 30, maxIterations: 5 }
    const back = configFromForm('s1', formFromConfig(cfg))
    expect('error' in back).toBe(false)
    if (!('error' in back)) expect(back.metric).toEqual(cfg.metric)
  })
})

describe('describeMetric', () => {
  it('describes each kind', () => {
    expect(describeMetric({ kind: 'exit-code', direction: 'minimize' })).toMatch(/exit/i)
    expect(describeMetric({ kind: 'llm-judge', rubric: 'r', maxScore: 10, direction: 'maximize' })).toMatch(/judge/i)
  })
})
