import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScoreTrend } from './ScoreTrend'
import type { LoopIteration, MetricSpec } from '../../types'

const metric: MetricSpec = { kind: 'llm-judge', rubric: 'r', maxScore: 100, direction: 'maximize' }

const iteration = (index: number, score: number, outcome: LoopIteration['outcome'], commitSha: string): LoopIteration => ({
  index,
  startedAt: index,
  finishedAt: index + 1,
  score,
  outcome,
  commitSha,
})

describe('ScoreTrend', () => {
  it('renders a bar for every scored iteration, not only the best', () => {
    const iterations = [
      iteration(1, 84, 'improved', 'a'),
      iteration(2, 92, 'regressed', 'b'),
      iteration(3, 96, 'improved', 'c'),
    ]

    const { container } = render(<ScoreTrend iterations={iterations} metric={metric} bestCommitSha="c" />)

    expect(screen.getByText('Score over time')).toBeTruthy()
    expect(container.querySelectorAll('[title^="#"]')).toHaveLength(3)
  })
})
