import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { RepoFetchButton } from './RepoFetchButton'

const baseProps = {
  repoName: 'Alpha',
  baseBranch: 'main',
  behindCount: 0,
  isFetching: false,
  onFetch: vi.fn(),
}

describe('RepoFetchButton', () => {
  it('shows no badge and the plain tooltip when up to date', () => {
    render(<RepoFetchButton {...baseProps} />)

    const btn = screen.getByRole('button', { name: 'Fetch Alpha' })
    expect(btn).toHaveAttribute('title', 'Fetch latest from remote')
    expect(btn.textContent).not.toMatch(/\d/)
  })

  it('shows the behind count and an explanatory tooltip when behind', () => {
    render(<RepoFetchButton {...baseProps} behindCount={3} />)

    const btn = screen.getByRole('button', { name: 'Fetch Alpha (3 behind origin)' })
    expect(btn.textContent).toContain('3')
    expect(btn).toHaveAttribute(
      'title',
      'main is 3 commits behind origin — fetch before starting a new agent',
    )
  })

  it('uses singular wording for one commit', () => {
    render(<RepoFetchButton {...baseProps} behindCount={1} />)

    const btn = screen.getByRole('button', { name: 'Fetch Alpha (1 behind origin)' })
    expect(btn).toHaveAttribute(
      'title',
      'main is 1 commit behind origin — fetch before starting a new agent',
    )
  })

  it('caps the badge at 9+', () => {
    render(<RepoFetchButton {...baseProps} behindCount={42} />)

    expect(screen.getByText('9+')).toBeInTheDocument()
  })

  it('hides the badge while fetching', () => {
    render(<RepoFetchButton {...baseProps} behindCount={3} isFetching />)

    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  it('is disabled while fetching', () => {
    render(<RepoFetchButton {...baseProps} isFetching />)

    expect(screen.getByRole('button', { name: 'Fetch Alpha' })).toBeDisabled()
  })

  it('calls onFetch on click', () => {
    const onFetch = vi.fn()
    render(<RepoFetchButton {...baseProps} onFetch={onFetch} />)

    fireEvent.click(screen.getByRole('button', { name: 'Fetch Alpha' }))

    expect(onFetch).toHaveBeenCalledTimes(1)
  })

  // The row it sits on is itself a button that selects the folder and opens its
  // files; fetching must not do either.
  it('does not let the click reach the row', () => {
    const onRowClick = vi.fn()
    render(
      <div onClick={onRowClick}>
        <RepoFetchButton {...baseProps} onFetch={vi.fn()} />
      </div>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Fetch Alpha' }))

    expect(onRowClick).not.toHaveBeenCalled()
  })
})
