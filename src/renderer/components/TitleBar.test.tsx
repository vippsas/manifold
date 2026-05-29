import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { TitleBar } from './TitleBar'

describe('TitleBar', () => {
  it('shows "Manifold" when no project is active', () => {
    render(<TitleBar />)
    expect(screen.getByText('Manifold')).toBeInTheDocument()
  })

  it('renders the active project name as a rename button', () => {
    render(<TitleBar projectName="Alpha" onRename={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument()
  })

  it('commits a new name on Enter', () => {
    const onRename = vi.fn()
    render(<TitleBar projectName="Alpha" onRename={onRename} />)
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    const input = screen.getByLabelText('Project name')
    fireEvent.change(input, { target: { value: 'Beta' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('Beta')
  })

  it('discards the edit on Escape', () => {
    const onRename = vi.fn()
    render(<TitleBar projectName="Alpha" onRename={onRename} />)
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    const input = screen.getByLabelText('Project name')
    fireEvent.change(input, { target: { value: 'Beta' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument()
  })

  it('ignores an unchanged or empty name', () => {
    const onRename = vi.fn()
    render(<TitleBar projectName="Alpha" onRename={onRename} />)
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }))
    const input = screen.getByLabelText('Project name')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).not.toHaveBeenCalled()
  })
})
