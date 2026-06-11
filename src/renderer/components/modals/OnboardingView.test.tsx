import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { OnboardingView } from './OnboardingView'

describe('OnboardingView starfield', () => {
  it('renders the starfield backdrop behind the no-project hero', () => {
    render(
      <OnboardingView
        variant="no-project"
        onAddProject={vi.fn()}
        onCloneProject={vi.fn(async () => true)}
        onCreateNewProject={vi.fn(async () => true)}
      />
    )

    expect(screen.getByTestId('starfield-backdrop')).toBeInTheDocument()
  })
})
