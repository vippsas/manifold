import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { TabBar } from './CodeViewerTabs'

function renderTabBar(overrides: Partial<React.ComponentProps<typeof TabBar>> = {}) {
  return render(
    <TabBar
      openFiles={[{ path: '/repo/log.md', content: '# log', refreshVersion: 0 }]}
      activeFilePath="/repo/log.md"
      onActivatePane={vi.fn()}
      onSelectTab={vi.fn()}
      onCloseTab={vi.fn()}
      {...overrides}
    />,
  )
}

describe('TabBar', () => {
  it('marks transient tabs as unsaved', () => {
    const { getByLabelText } = renderTabBar({
      openFiles: [{ path: 'manifold-untitled:/Git Sync Output.txt', content: 'log', refreshVersion: 0, transient: true }],
      activeFilePath: 'manifold-untitled:/Git Sync Output.txt',
    })

    expect(getByLabelText('Unsaved temporary file')).toBeInTheDocument()
  })

  // This strip is the editor's only header now — the dock group's own header is
  // hidden for an editor pane — so it carries the double-click-to-maximize the
  // group's tab used to.
  it('toggles focus mode when its background is double-clicked', () => {
    const onToggleMaximize = vi.fn()

    const { container } = renderTabBar({ onToggleMaximize })
    fireEvent.doubleClick(container.firstElementChild!)

    expect(onToggleMaximize).toHaveBeenCalledTimes(1)
  })

  it('leaves a double-click on a file tab to the tab', () => {
    const onToggleMaximize = vi.fn()

    const { container } = renderTabBar({ onToggleMaximize })
    fireEvent.doubleClick(container.querySelector('.code-tab')!)

    expect(onToggleMaximize).not.toHaveBeenCalled()
  })

  it('leaves a double-click on a pane control to the control', () => {
    const onToggleMaximize = vi.fn()

    const { getByRole } = renderTabBar({
      onToggleMaximize,
      actions: <button type="button">Preview</button>,
    })
    fireEvent.doubleClick(getByRole('button', { name: 'Preview' }))

    expect(onToggleMaximize).not.toHaveBeenCalled()
  })
})
