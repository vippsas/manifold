import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WelcomeDialog } from './WelcomeDialog'

function renderWelcome(overrides: Partial<React.ComponentProps<typeof WelcomeDialog>> = {}) {
  const props: React.ComponentProps<typeof WelcomeDialog> = {
    onAddProject: vi.fn(),
    onCloneProject: vi.fn(async () => true),
    onComplete: vi.fn(),
    ...overrides,
  }
  return { ...render(<WelcomeDialog {...props} />), props }
}

describe('WelcomeDialog (first-run)', () => {
  it('welcomes the newcomer and explains what Manifold is', () => {
    renderWelcome()

    expect(screen.getByRole('img', { name: 'Manifold' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Welcome to Manifold/i })).toBeInTheDocument()
    expect(
      screen.getByText(/Run multiple AI coding agents in parallel/i)
    ).toBeInTheDocument()
  })

  it('offers a primary "open a local project" action and a secondary clone link', () => {
    renderWelcome()

    expect(screen.getByRole('button', { name: 'Open a local project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clone a repository' })).toBeInTheDocument()
    // The clone form is hidden until the user opts into cloning.
    expect(screen.queryByPlaceholderText(/git@github\.com/)).not.toBeInTheDocument()
  })

  it('opens a local project and hands the user into the workspace', () => {
    const onAddProject = vi.fn()
    const onComplete = vi.fn()
    renderWelcome({ onAddProject, onComplete })

    fireEvent.click(screen.getByRole('button', { name: 'Open a local project' }))

    expect(onAddProject).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('reveals a clone form with guidance when the user chooses to clone', () => {
    renderWelcome()

    fireEvent.click(screen.getByRole('button', { name: 'Clone a repository' }))

    expect(screen.getByPlaceholderText(/git@github\.com/)).toBeInTheDocument()
    // Newcomer guidance for the clone field.
    expect(screen.getByText(/SSH or HTTPS/i)).toBeInTheDocument()
  })

  it('shows a cloning state and disables the field while a clone is in flight', async () => {
    let resolveClone: (ok: boolean) => void = () => {}
    const onCloneProject = vi.fn(
      () => new Promise<boolean>((resolve) => { resolveClone = resolve })
    )
    renderWelcome({ onCloneProject })

    fireEvent.click(screen.getByRole('button', { name: 'Clone a repository' }))
    const input = screen.getByPlaceholderText(/git@github\.com/)
    fireEvent.change(input, { target: { value: 'git@github.com:user/repo.git' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clone' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Cloning/i })).toBeInTheDocument()
    })
    expect(input).toBeDisabled()

    resolveClone(true)
  })

  it('surfaces a recoverable error when the clone fails', async () => {
    const onCloneProject = vi.fn(async () => false)
    const onComplete = vi.fn()
    renderWelcome({ onCloneProject, onComplete })

    fireEvent.click(screen.getByRole('button', { name: 'Clone a repository' }))
    fireEvent.change(screen.getByPlaceholderText(/git@github\.com/), {
      target: { value: 'git@github.com:user/repo.git' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Clone' }))

    await waitFor(() => {
      expect(screen.getByText(/Clone failed/i)).toBeInTheDocument()
    })
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('hands the user into the workspace after a successful clone', async () => {
    const onCloneProject = vi.fn(async () => true)
    const onComplete = vi.fn()
    renderWelcome({ onCloneProject, onComplete })

    fireEvent.click(screen.getByRole('button', { name: 'Clone a repository' }))
    fireEvent.change(screen.getByPlaceholderText(/git@github\.com/), {
      target: { value: 'git@github.com:user/repo.git' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Clone' }))

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1)
    })
  })
})
