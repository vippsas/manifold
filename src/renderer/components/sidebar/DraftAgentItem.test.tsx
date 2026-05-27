import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { DraftAgentItem } from './DraftAgentItem'

const draft = {
  id: 'draft-1',
  projectId: 'p1',
  runtimeId: 'claude',
  branchName: 'manifold/oslo',
}

describe('DraftAgentItem', () => {
  it('renders the "New chat" label and the chat glyph', () => {
    render(
      <DraftAgentItem
        draft={draft}
        isActive={false}
        onSelect={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.getByText('New chat')).toBeInTheDocument()
    expect(screen.getByLabelText('Chat agent')).toBeInTheDocument()
  })

  it('calls onSelect with draft id when clicked', () => {
    const onSelect = vi.fn()
    render(
      <DraftAgentItem draft={draft} isActive={false} onSelect={onSelect} onDiscard={vi.fn()} />,
    )
    fireEvent.click(screen.getByText('New chat'))
    expect(onSelect).toHaveBeenCalledWith('draft-1')
  })

  it('calls onDiscard when the delete button is clicked', () => {
    const onDiscard = vi.fn()
    render(
      <DraftAgentItem draft={draft} isActive={false} onSelect={vi.fn()} onDiscard={onDiscard} />,
    )
    fireEvent.click(screen.getByLabelText(/Discard draft/i))
    expect(onDiscard).toHaveBeenCalledWith('draft-1')
  })
})
