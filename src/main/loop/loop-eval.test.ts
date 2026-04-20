import { describe, it, expect } from 'vitest'
import { parseMetric, isImprovement } from './loop-eval'
import type { MetricSpec } from '../../shared/loop-types'

describe('parseMetric — stdout-regex', () => {
  const spec: MetricSpec = { kind: 'stdout-regex', pattern: 'ms=(\\d+(?:\\.\\d+)?)', direction: 'minimize' }

  it('extracts the first capture group as a number', () => {
    const result = parseMetric('build ok\nms=42.5\ndone\n', 0, spec)
    expect(result).toEqual({ score: 42.5 })
  })

  it('returns failure when the pattern does not match', () => {
    const result = parseMetric('no number here', 0, spec)
    expect(result.failure).toContain('no match')
  })

  it('returns failure when capture group 1 is not numeric', () => {
    const spec2: MetricSpec = { kind: 'stdout-regex', pattern: 'result=(\\S+)', direction: 'maximize' }
    const result = parseMetric('result=failed', 0, spec2)
    expect(result.failure).toContain('not a number')
  })
})

describe('parseMetric — json-path', () => {
  const spec: MetricSpec = { kind: 'json-path', path: 'results.meanMs', direction: 'minimize' }

  it('extracts a nested numeric value by dotted path', () => {
    const stdout = JSON.stringify({ results: { meanMs: 17.2 } })
    expect(parseMetric(stdout, 0, spec)).toEqual({ score: 17.2 })
  })

  it('handles top-level keys', () => {
    const spec2: MetricSpec = { kind: 'json-path', path: 'score', direction: 'maximize' }
    expect(parseMetric('{"score":99}', 0, spec2)).toEqual({ score: 99 })
  })

  it('fails when stdout is not valid JSON', () => {
    const result = parseMetric('not json', 0, spec)
    expect(result.failure).toContain('json')
  })

  it('fails when the path does not resolve to a number', () => {
    const result = parseMetric('{"results":{"meanMs":"slow"}}', 0, spec)
    expect(result.failure).toContain('not a number')
  })

  it('ignores leading non-JSON lines and parses the last JSON block', () => {
    const stdout = '> running bench\n> stderr line\n{"results":{"meanMs":3.3}}\n'
    expect(parseMetric(stdout, 0, spec)).toEqual({ score: 3.3 })
  })
})

describe('parseMetric — exit-code', () => {
  const spec: MetricSpec = { kind: 'exit-code', direction: 'minimize' }

  it('returns 0 on success', () => {
    expect(parseMetric('', 0, spec)).toEqual({ score: 0 })
  })

  it('returns 1 on failure (exit code mapped to pass/fail score)', () => {
    expect(parseMetric('', 1, spec)).toEqual({ score: 1 })
    expect(parseMetric('', 137, spec)).toEqual({ score: 1 })
  })
})

describe('isImprovement', () => {
  it('minimize: lower is better', () => {
    expect(isImprovement(5, 10, 'minimize')).toBe(true)
    expect(isImprovement(10, 5, 'minimize')).toBe(false)
    expect(isImprovement(5, 5, 'minimize')).toBe(false)
  })

  it('maximize: higher is better', () => {
    expect(isImprovement(10, 5, 'maximize')).toBe(true)
    expect(isImprovement(5, 10, 'maximize')).toBe(false)
    expect(isImprovement(5, 5, 'maximize')).toBe(false)
  })

  it('first iteration (no best yet) always improves', () => {
    expect(isImprovement(42, undefined, 'minimize')).toBe(true)
    expect(isImprovement(42, undefined, 'maximize')).toBe(true)
  })
})
