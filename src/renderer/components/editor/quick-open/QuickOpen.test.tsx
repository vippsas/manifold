import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QuickOpen } from './QuickOpen'

const invoke = vi.fn()
beforeEach(() => {
  invoke.mockReset()
  ;(window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke }
})

function renderOpen(onSelect = vi.fn(), onClose = vi.fn()) {
  invoke.mockResolvedValue(['src/CodeViewer.tsx', 'src/code-viewer-diff.ts', 'README.md'])
  render(
    <QuickOpen
      visible
      sessionId="s1"
      worktreeRoot="/repo"
      onSelect={onSelect}
      onClose={onClose}
    />,
  )
  return { onSelect, onClose }
}

describe('QuickOpen', () => {
  it('lists files from files:list and filters by query', async () => {
    renderOpen()
    await waitFor(() => expect(screen.getByText('README.md')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Go to file'), { target: { value: 'codeview' } })
    expect(screen.getByText('src/CodeViewer.tsx')).toBeInTheDocument()
    expect(screen.queryByText('README.md')).toBeNull()
  })

  it('requests the file list for the session', async () => {
    renderOpen()
    await waitFor(() => expect(screen.getByText('README.md')).toBeInTheDocument())
    expect(invoke).toHaveBeenCalledWith('files:list', 's1')
  })

  it('moves selection with ArrowDown', async () => {
    const onSelect = vi.fn()
    renderOpen(onSelect)
    await waitFor(() => expect(screen.getByText('README.md')).toBeInTheDocument())
    const input = screen.getByLabelText('Go to file')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('/repo/src/code-viewer-diff.ts')
  })

  it('opens the highlighted file as an absolute path on Enter', async () => {
    const { onSelect } = renderOpen()
    await waitFor(() => expect(screen.getByText('src/CodeViewer.tsx')).toBeInTheDocument())
    const input = screen.getByLabelText('Go to file')
    fireEvent.change(input, { target: { value: 'codeview' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('/repo/src/CodeViewer.tsx')
  })

  it('closes on Escape', async () => {
    const { onClose } = renderOpen()
    await waitFor(() => expect(screen.getByText('README.md')).toBeInTheDocument())
    fireEvent.keyDown(screen.getByLabelText('Go to file'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('renders nothing when not visible', () => {
    render(<QuickOpen visible={false} sessionId="s1" worktreeRoot="/repo" onSelect={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByLabelText('Go to file')).toBeNull()
  })
})
