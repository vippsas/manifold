import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  it('opens a repository-name dialog before creating a new project', () => {
    renderActions()

    fireEvent.change(screen.getByPlaceholderText('Describe your project idea...'), {
      target: { value: 'Build a focus timer' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))

    expect(screen.getByRole('dialog', { name: 'Choose repository name' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('build-a-focus-timer')).toBeInTheDocument()
    expect(screen.getByText('Initial branch')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
  })

  it('submits the chosen repository name and sanitizes it', async () => {
    const onCreateNewProject = vi.fn(async () => true)
    renderActions({ onCreateNewProject })

    fireEvent.change(screen.getByPlaceholderText('Describe your project idea...'), {
      target: { value: 'Build a timer app' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))

    const dialog = screen.getByRole('dialog', { name: 'Choose repository name' })
    const repoNameInput = within(dialog).getAllByRole('textbox')[0]

    fireEvent.change(repoNameInput, {
      target: { value: 'Timer App 2!' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create Repository' }))

    await waitFor(() => {
      expect(onCreateNewProject).toHaveBeenCalledWith({
        description: 'Build a timer app',
        repoName: 'timer-app-2',
      })
    })
  })
})
