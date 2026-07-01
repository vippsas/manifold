import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import {
  installElectronApi,
  installLocalStorage,
  renderProjectSidebar,
} from './ProjectSidebar.test-helpers'

beforeEach(() => {
  vi.clearAllMocks()
  installLocalStorage()
  installElectronApi()
})

afterEach(() => {
  // Don't delete electronAPI — React may still call unsubscribe during unmount cleanup
})

describe('ProjectSidebar', () => {
  it('opens a folder picker via onOpenFolder when the activity-bar + is clicked', () => {
    const { props } = renderProjectSidebar()

    fireEvent.click(screen.getByLabelText('Open folder'))

    expect(props.onOpenFolder).toHaveBeenCalledTimes(1)
  })

  it('shows the Explorer file view by default', () => {
    renderProjectSidebar()

    // Without a DockStateContext the embedded file tree shows its empty state.
    expect(screen.getByText('No folder open')).toBeInTheDocument()
  })

  it('switches to the Source Control view from the activity bar', () => {
    renderProjectSidebar()

    expect(screen.getByText('No folder open')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Source Control'))

    // Source Control replaces the Explorer; without context it shows its empty state.
    expect(screen.getByText('No active repository')).toBeInTheDocument()
    expect(screen.queryByText('No folder open')).not.toBeInTheDocument()
  })

  it('switches back to the Explorer view from the activity bar', () => {
    renderProjectSidebar({ initialView: 'sourceControl' })

    expect(screen.getByText('No active repository')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Explorer'))

    expect(screen.getByText('No folder open')).toBeInTheDocument()
    expect(screen.queryByText('No active repository')).not.toBeInTheDocument()
  })

  it('marks the active activity icon', () => {
    renderProjectSidebar({ initialView: 'sourceControl' })

    expect(screen.getByLabelText('Source Control')).toHaveClass('sidebar-activity-icon--active')
    expect(screen.getByLabelText('Explorer')).not.toHaveClass('sidebar-activity-icon--active')
  })

  it('exposes a Search tab and marks it active when selected', () => {
    renderProjectSidebar()

    const searchTab = screen.getByLabelText('Search')
    expect(searchTab).not.toHaveClass('sidebar-activity-icon--active')

    fireEvent.click(searchTab)

    expect(searchTab).toHaveClass('sidebar-activity-icon--active')
    expect(screen.getByLabelText('Explorer')).not.toHaveClass('sidebar-activity-icon--active')
  })
})
