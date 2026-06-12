import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorStatusBar, type EditorStatusInfo } from './EditorStatusBar'

const INFO: EditorStatusInfo = {
  line: 12,
  column: 4,
  selectionLength: 0,
  language: 'typescript',
  indent: 'Spaces: 2',
  eol: 'LF',
}

describe('EditorStatusBar', () => {
  it('renders cursor position, indent, eol, and language', () => {
    render(<EditorStatusBar info={INFO} />)
    expect(screen.getByText('Ln 12, Col 4')).toBeInTheDocument()
    expect(screen.getByText('Spaces: 2')).toBeInTheDocument()
    expect(screen.getByText('LF')).toBeInTheDocument()
    expect(screen.getByText('typescript')).toBeInTheDocument()
  })

  it('shows selection length only when a selection exists', () => {
    const { rerender } = render(<EditorStatusBar info={INFO} />)
    expect(screen.queryByText(/selected/)).toBeNull()
    rerender(<EditorStatusBar info={{ ...INFO, selectionLength: 7 }} />)
    expect(screen.getByText('(7 selected)')).toBeInTheDocument()
  })
})
