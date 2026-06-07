import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FileTreeToolbar } from './FileTreeToolbar'

function renderToolbar(overrides: Partial<React.ComponentProps<typeof FileTreeToolbar>> = {}): void {
  render(
    <FileTreeToolbar
      filterQuery=""
      onFilterChange={vi.fn()}
      onClearFilter={vi.fn()}
      onExpandAll={vi.fn()}
      onCollapseAll={vi.fn()}
      {...overrides}
    />,
  )
}

describe('FileTreeToolbar', () => {
  it('calls onRefresh when the refresh button is clicked', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)

    renderToolbar({ onRefresh })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh file tree' }))

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
  })
})
