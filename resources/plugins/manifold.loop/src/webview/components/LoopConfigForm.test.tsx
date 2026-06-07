import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LoopConfigForm } from './LoopConfigForm'
import type { LoopConfig } from '../../types'

const CONFIG: LoopConfig = {
  sessionId: 's1',
  program: 'make the target better',
  targetGlobs: ['src/**'],
  evalCommand: '',
  metric: { kind: 'llm-judge', rubric: 'score it', maxScore: 10, direction: 'maximize' },
  budgetSeconds: 60,
  maxIterations: 3,
}

describe('LoopConfigForm', () => {
  it('starts from a button click without relying on native form submit', () => {
    const onStart = vi.fn()
    render(
      <LoopConfigForm
        sessionId="s1"
        initialConfig={CONFIG}
        disabled={false}
        onStart={onStart}
        onSave={vi.fn()}
        onImproveWithAi={async () => ''}
      />,
    )

    const startButton = screen.getByRole('button', { name: 'Start Loop' })
    expect(startButton.getAttribute('type')).toBe('button')
    fireEvent.click(startButton)

    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      program: 'make the target better',
    }))
  })
})
