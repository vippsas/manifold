import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import {
  installElectronApi,
  installLocalStorage,
  renderSidebar,
} from './ProjectSidebar.test-helpers'

const SORTED_BY_RECENCY = 'Sorted by recently used — click to sort A–Z'
const SORTED_ALPHA = 'Sorted A–Z — click to sort by recently used'

/** The workspace rows in the order they render, read off each row's disclosure
 *  label — a row's own text carries its repo as a dimmed prefix too, so the
 *  label is the one place the workspace name stands alone. */
const rowNames = (): string[] =>
  Array.from(document.querySelectorAll('.sidebar-project-row')).map(
    (row) =>
      within(row as HTMLElement)
        .getByRole('button', { name: /^(Expand|Collapse) / })
        .getAttribute('aria-label')
        ?.replace(/^(Expand|Collapse) /, '') ?? '',
  )

beforeEach(() => {
  vi.clearAllMocks()
  installLocalStorage()
  installElectronApi()
})

describe('sidebar sort toggle', () => {
  it('starts in recency, with the active workspace pinned first', () => {
    localStorage.setItem('manifold.sidebar.recency.v1', JSON.stringify({ w2: 200 }))
    renderSidebar({ activeWorkspaceId: 'w1' })

    expect(screen.getByLabelText(SORTED_BY_RECENCY)).toBeInTheDocument()
    expect(rowNames()).toEqual(['alpha-space', 'beta-space'])
  })

  // A→Z drops the pin, so the active workspace takes its alphabetical place.
  it('reorders strictly A–Z on click, unpinning the active workspace', () => {
    localStorage.setItem('manifold.sidebar.recency.v1', JSON.stringify({ w2: 200 }))
    renderSidebar({
      activeWorkspaceId: 'w2',
      workspaces: [
        { id: 'w2', name: 'zeta-space', projectIds: ['p2'], createdAt: '2024-01-02' },
        { id: 'w1', name: 'alpha-space', projectIds: ['p1'], createdAt: '2024-01-01' },
      ],
    })

    expect(rowNames()).toEqual(['zeta-space', 'alpha-space'])

    fireEvent.click(screen.getByLabelText(SORTED_BY_RECENCY))

    expect(rowNames()).toEqual(['alpha-space', 'zeta-space'])
    expect(screen.getByLabelText(SORTED_ALPHA)).toBeInTheDocument()
  })

  it('restores the chosen mode on remount', () => {
    const first = renderSidebar()
    fireEvent.click(screen.getByLabelText(SORTED_BY_RECENCY))
    first.unmount()

    renderSidebar()
    expect(screen.getByLabelText(SORTED_ALPHA)).toBeInTheDocument()
  })

  it('leaves the New Repo action in place', () => {
    renderSidebar()
    expect(screen.getByLabelText('New Repo')).toBeInTheDocument()
  })
})
