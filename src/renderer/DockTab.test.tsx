import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { IDockviewPanelHeaderProps } from 'dockview'
import { DockTab } from './DockTab'

function makeHeaderProps(id: string, title: string): IDockviewPanelHeaderProps {
  return {
    api: { id, title } as IDockviewPanelHeaderProps['api'],
  } as IDockviewPanelHeaderProps
}

describe('DockTab', () => {
  it('keeps shell-specific actions out of the Shell dock tab', () => {
    render(<DockTab {...makeHeaderProps('shell', 'Shell')} />)

    expect(screen.getByText('Shell')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New shell tab' })).toBeNull()
  })
})
