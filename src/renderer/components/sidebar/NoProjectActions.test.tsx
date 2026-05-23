import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NoProjectActions } from './NoProjectActions'

function renderActions(overrides: Partial<React.ComponentProps<typeof NoProjectActions>> = {}) {
  const props: React.ComponentProps<typeof NoProjectActions> = {
    onAddProject: vi.fn(),
    onCloneProject: vi.fn(async () => true),
    onCreateNewProject: vi.fn(async () => true),
    creatingProject: false,
    cloningProject: false,
    createError: null,
    ...overrides,
  }

  return {
    ...render(<NoProjectActions {...props} />),
    props,
  }
}

describe('NoProjectActions', () => {
  it('submits the description directly when Go is clicked', async () => {
    const onCreateNewProject = vi.fn(async () => true)
    renderActions({ onCreateNewProject })

    fireEvent.change(screen.getByPlaceholderText('Describe your project idea...'), {
      target: { value: 'Build a focus timer' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))

    await waitFor(() => {
      expect(onCreateNewProject).toHaveBeenCalledWith({
        description: 'Build a focus timer',
      })
    })
  })

  it('does not submit when description is empty', () => {
    const onCreateNewProject = vi.fn(async () => true)
    renderActions({ onCreateNewProject })

    fireEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(onCreateNewProject).not.toHaveBeenCalled()
  })
})
