import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../../../shared/norwegian-cities', () => ({
  pickRandomNorwegianCityName: vi.fn(() => 'Oslo'),
}))

import { NewAgentForm } from './NewAgentForm'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'runtimes:list') {
      return Promise.resolve([
        { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
      ])
    }
    return Promise.resolve([])
  })

  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  }
})

function renderForm(overrides = {}) {
  const props = {
    projectId: 'proj-1',
    baseBranch: 'main',
    defaultRuntime: 'claude',
    onLaunch: vi.fn(),
    ...overrides,
  }

  return { ...render(<NewAgentForm {...props} />), props }
}

describe('NewAgentForm', () => {
  it('allows submitting without typing an agent name', async () => {
    renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    expect(screen.getByText('Start →')).toBeEnabled()
  })

  it('uses a random Norwegian city when submitted with a blank name', async () => {
    const { props } = renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.click(screen.getByText('Start →'))

    expect(props.onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'Oslo',
      }),
    )
  })

  it('uses the typed agent name when one is provided', async () => {
    const { props } = renderForm()
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('runtimes:list'))

    fireEvent.change(screen.getByPlaceholderText('Agent name (optional), e.g. Dark mode toggle'), {
      target: { value: 'Dark mode toggle' },
    })
    fireEvent.click(screen.getByText('Start →'))

    expect(props.onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Dark mode toggle',
      }),
    )
  })
})
