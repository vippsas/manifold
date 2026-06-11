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
  it('shows the prompt textarea immediately, defaulting to copied instructions', () => {
    renderActions()

    expect(screen.getByPlaceholderText('Paste the copied project instructions...')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Copied instructions' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Start Project' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Go' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('switches the placeholder when selecting From scratch', () => {
    renderActions()

    fireEvent.click(screen.getByRole('tab', { name: 'From scratch' }))

    expect(screen.getByPlaceholderText('Describe what you want to build...')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'From scratch' })).toHaveAttribute('aria-selected', 'true')
  })

  it('submits a scratch project without projectKind', async () => {
    const onCreateNewProject = vi.fn(async () => true)
    renderActions({ onCreateNewProject })

    fireEvent.click(screen.getByRole('tab', { name: 'From scratch' }))
    fireEvent.change(screen.getByPlaceholderText('Describe what you want to build...'), {
      target: { value: 'Build a focus timer' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start Project' }))

    await waitFor(() => {
      expect(onCreateNewProject).toHaveBeenCalledWith({
        description: 'Build a focus timer',
      })
    })
  })

  it('submits copied instructions as a plain folder project', async () => {
    const onCreateNewProject = vi.fn(async () => true)
    renderActions({ onCreateNewProject })

    fireEvent.change(screen.getByPlaceholderText('Paste the copied project instructions...'), {
      target: { value: 'Clone the prepared repository and continue.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start Project' }))

    await waitFor(() => {
      expect(onCreateNewProject).toHaveBeenCalledWith({
        description: 'Clone the prepared repository and continue.',
        projectKind: 'folder',
      })
    })
  })

  it('keeps Start Project disabled for whitespace-only input', () => {
    const onCreateNewProject = vi.fn(async () => true)
    renderActions({ onCreateNewProject })

    fireEvent.change(screen.getByPlaceholderText('Paste the copied project instructions...'), {
      target: { value: '   ' },
    })

    expect(screen.getByRole('button', { name: 'Start Project' })).toBeDisabled()
    expect(onCreateNewProject).not.toHaveBeenCalled()
  })

  it('clears the textarea after a successful create', async () => {
    renderActions()

    const textarea = screen.getByPlaceholderText('Paste the copied project instructions...')
    fireEvent.change(textarea, { target: { value: 'Copied setup prompt' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start Project' }))

    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe('')
    })
  })
})
