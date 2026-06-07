import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { ShellHeaderActions } from './ShellHeaderActions'
import { ShellTabs } from './ShellTabs'

vi.mock('../../hooks/useTerminal', () => ({
  useTerminal: () => ({ containerRef: { current: null } }),
}))

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'shell:create') return Promise.resolve({ sessionId: 'extra-shell-1' })
    if (channel === 'shell-tabs:get') return Promise.resolve(null)
    return Promise.resolve(undefined)
  })

  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
  }
})

function makeHeaderProps(): IDockviewHeaderActionsProps {
  return {
    api: {} as IDockviewHeaderActionsProps['api'],
    containerApi: {} as IDockviewHeaderActionsProps['containerApi'],
    panels: [],
    activePanel: { id: 'shell' } as IDockviewHeaderActionsProps['activePanel'],
    isGroupActive: true,
    group: {} as IDockviewHeaderActionsProps['group'],
    headerPosition: 'top',
  }
}

describe('ShellTabs', () => {
  it('creates a system shell when selected from the header menu', async () => {
    render(
      <>
        <ShellTabs
          worktreeSessionId="main-shell"
          projectSessionId={null}
          worktreeCwd="/repo"
          scrollbackLines={5000}
        />
        <ShellHeaderActions {...makeHeaderProps()} />
      </>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'New Shell' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New System Shell' }))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('shell:create', '/repo', { mode: 'system' })
    })
  })
})
