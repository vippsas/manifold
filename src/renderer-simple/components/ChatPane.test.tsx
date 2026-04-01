import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatPane } from './ChatPane'

describe('ChatPane', () => {
  it('sends the current message on Enter and clears the composer', () => {
    const onSend = vi.fn()

    render(<ChatPane messages={[]} onSend={onSend} />)

    const composer = screen.getByPlaceholderText('Tell the agent what to change...') as HTMLTextAreaElement
    fireEvent.change(composer, { target: { value: '  add dark mode  ' } })
    fireEvent.keyDown(composer, { key: 'Enter' })

    expect(composer.tagName).toBe('TEXTAREA')
    expect(onSend).toHaveBeenCalledWith('add dark mode')
    expect(composer).toHaveValue('')
  })

  it('adds a newline on Shift+Enter without sending', () => {
    const onSend = vi.fn()

    render(<ChatPane messages={[]} onSend={onSend} />)

    const composer = screen.getByPlaceholderText('Tell the agent what to change...') as HTMLTextAreaElement
    fireEvent.change(composer, { target: { value: 'First line' } })
    composer.setSelectionRange(composer.value.length, composer.value.length)
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true })

    expect(onSend).not.toHaveBeenCalled()
    expect(composer).toHaveValue('First line\n')
  })

  it('caps the composer at four visible lines and enables scrolling for longer input', async () => {
    const onSend = vi.fn()

    render(<ChatPane messages={[]} onSend={onSend} />)

    const composer = screen.getByPlaceholderText('Tell the agent what to change...') as HTMLTextAreaElement
    let scrollHeight = 48
    Object.defineProperty(composer, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    })

    fireEvent.change(composer, { target: { value: 'One line' } })

    await waitFor(() => {
      expect(composer.style.height).toBe('48px')
    })
    expect(composer.style.overflowY).toBe('hidden')

    scrollHeight = 160
    fireEvent.change(composer, { target: { value: '1\n2\n3\n4\n5' } })

    await waitFor(() => {
      expect(composer.style.height).toBe('114px')
    })
    expect(composer.style.overflowY).toBe('auto')
  })
})
