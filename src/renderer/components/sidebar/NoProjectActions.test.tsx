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

function openNewProject(): void {
  fireEvent.click(screen.getByRole('button', { name: /New project/ }))
}

describe('NoProjectActions', () => {
  it('shows the three path cards first, with no form fields', () => {
    renderActions()

    expect(screen.getByRole('button', { name: /New project/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Local repository/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Clone from Git/ })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('opens the folder picker directly from the Local repository card', () => {
    const onAddProject = vi.fn()
    renderActions({ onAddProject })

    fireEvent.click(screen.getByRole('button', { name: /Local repository/ }))

    expect(onAddProject).toHaveBeenCalledTimes(1)
  })

  it('shows the prompt textarea after choosing New project, defaulting to copied instructions', () => {
    renderActions()
    openNewProject()

    expect(screen.getByPlaceholderText('Paste the copied project instructions...')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Copied instructions' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Start Project' })).toBeDisabled()
  })

  it('returns to the chooser from the New project view via Back', () => {
    renderActions()
    openNewProject()

    fireEvent.click(screen.getByRole('button', { name: '← Back' }))

    expect(screen.getByRole('button', { name: /Clone from Git/ })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Paste the copied project instructions...')).not.toBeInTheDocument()
  })

  it('switches the placeholder when selecting From scratch', () => {
    renderActions()
    openNewProject()

    fireEvent.click(screen.getByRole('tab', { name: 'From scratch' }))

    expect(screen.getByPlaceholderText('Describe what you want to build...')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'From scratch' })).toHaveAttribute('aria-selected', 'true')
  })

  it('submits a scratch project without projectKind', async () => {
    const onCreateNewProject = vi.fn(async () => true)
    renderActions({ onCreateNewProject })
    openNewProject()

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
    openNewProject()

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
    openNewProject()

    fireEvent.change(screen.getByPlaceholderText('Paste the copied project instructions...'), {
      target: { value: '   ' },
    })

    expect(screen.getByRole('button', { name: 'Start Project' })).toBeDisabled()
    expect(onCreateNewProject).not.toHaveBeenCalled()
  })

  it('clears the textarea after a successful create', async () => {
    renderActions()
    openNewProject()

    const textarea = screen.getByPlaceholderText('Paste the copied project instructions...')
    fireEvent.change(textarea, { target: { value: 'Copied setup prompt' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start Project' }))

    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe('')
    })
  })

  it('clones a repository from the Clone from Git card', async () => {
    const onCloneProject = vi.fn(async () => true)
    renderActions({ onCloneProject })

    fireEvent.click(screen.getByRole('button', { name: /Clone from Git/ }))
    fireEvent.change(screen.getByPlaceholderText('git@github.com:user/repo.git'), {
      target: { value: 'git@github.com:user/repo.git' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Clone' }))

    await waitFor(() => {
      expect(onCloneProject).toHaveBeenCalledWith('git@github.com:user/repo.git')
    })
  })
})
