import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { DraftChatView } from './DraftChatView'

describe('DraftChatView', () => {
  it('renders an empty chat with input enabled', () => {
    render(<DraftChatView onFirstSend={vi.fn()} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('calls onFirstSend with the typed text when the user submits', () => {
    const onFirstSend = vi.fn()
    render(<DraftChatView onFirstSend={onFirstSend} />)
    const textbox = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textbox, { target: { value: 'hello' } })
    fireEvent.keyDown(textbox, { key: 'Enter' })
    expect(onFirstSend).toHaveBeenCalledWith('hello')
  })
})
