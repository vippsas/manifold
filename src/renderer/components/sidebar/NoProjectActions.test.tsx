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
  it('shows start choices before the prompt textarea', () => {
    renderActions()

    expect(screen.getByRole('button', { name: 'Start from scratch' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start from copied instructions' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Go' })).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Describe what you want to build...')).not.toBeInTheDocument()
  })

  it('opens the prompt textarea for a project from scratch', () => {
    renderActions()

    fireEvent.click(screen.getByRole('button', { name: 'Start from scratch' }))

    expect(screen.getByPlaceholderText('Describe what you want to build...')).toBeInTheDocument()
  })

  it('opens the prompt textarea for copied instructions', () => {
    renderActions()

    fireEvent.click(screen.getByRole('button', { name: 'Start from copied instructions' }))

    expect(screen.getByPlaceholderText('Paste the copied project instructions...')).toBeInTheDocument()
  })

  it('submits the description directly when Go is clicked', async () => {
    const onCreateNewProject = vi.fn(async () => true)
    renderActions({ onCreateNewProject })

    fireEvent.click(screen.getByRole('button', { name: 'Start from scratch' }))
    fireEvent.change(screen.getByPlaceholderText('Describe what you want to build...'), {
      target: { value: 'Build a focus timer' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))

    await waitFor(() => {
      expect(onCreateNewProject).toHaveBeenCalledWith({
        description: 'Build a focus timer',
      })
    })
  })

  it('submits copied instructions as a plain folder project', async () => {
    const onCreateNewProject = vi.fn(async () => true)
    renderActions({ onCreateNewProject })

    fireEvent.click(screen.getByRole('button', { name: 'Start from copied instructions' }))
    fireEvent.change(screen.getByPlaceholderText('Paste the copied project instructions...'), {
      target: { value: 'Clone the prepared repository and continue.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))

    await waitFor(() => {
      expect(onCreateNewProject).toHaveBeenCalledWith({
        description: 'Clone the prepared repository and continue.',
        projectKind: 'folder',
      })
    })
  })

  it('does not submit when description is empty', () => {
    const onCreateNewProject = vi.fn(async () => true)
    renderActions({ onCreateNewProject })

    fireEvent.click(screen.getByRole('button', { name: 'Start from copied instructions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(onCreateNewProject).not.toHaveBeenCalled()
  })

  it('returns to the start choices when Back is clicked', () => {
    renderActions()

    fireEvent.click(screen.getByRole('button', { name: 'Start from copied instructions' }))
    fireEvent.change(screen.getByPlaceholderText('Paste the copied project instructions...'), {
      target: { value: 'Copied setup prompt' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.getByRole('button', { name: 'Start from scratch' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Paste the copied project instructions...')).not.toBeInTheDocument()
  })
})
