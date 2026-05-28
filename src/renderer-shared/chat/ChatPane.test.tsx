import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatPane, type FileDropConfig } from './ChatPane'

function changeWithCursor(el: HTMLTextAreaElement, value: string): void {
  fireEvent.change(el, { target: { value } })
  el.setSelectionRange(value.length, value.length)
  fireEvent.select(el)
}

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

  describe('@FILENAME autocomplete', () => {
    const mentionPaths = ['src/App.tsx', 'src/components/Chat.tsx', 'README.md']

    it('shows suggestions when typing @ and inserts the chosen path', () => {
      const onSend = vi.fn()
      render(<ChatPane messages={[]} onSend={onSend} mentionPaths={mentionPaths} />)

      const composer = screen.getByPlaceholderText('Tell the agent what to change...') as HTMLTextAreaElement
      changeWithCursor(composer, 'look at @Chat')

      const option = screen.getByText('Chat.tsx')
      expect(option).toBeInTheDocument()

      fireEvent.mouseDown(option)
      expect(composer).toHaveValue('look at @src/components/Chat.tsx ')
    })

    it('does not show the dropdown without mention paths', () => {
      render(<ChatPane messages={[]} onSend={vi.fn()} />)
      const composer = screen.getByPlaceholderText('Tell the agent what to change...') as HTMLTextAreaElement
      changeWithCursor(composer, 'hello @App')
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
  })

  describe('file-tree drag and drop', () => {
    const fileDrop: FileDropConfig = {
      hasPath: (dt) => Array.from(dt?.types ?? []).includes('app/path'),
      readPath: (dt) => dt?.getData('app/path') || null,
    }

    it('inserts @path when a file-tree path is dropped', () => {
      render(<ChatPane messages={[]} onSend={vi.fn()} fileDrop={fileDrop} />)
      const composer = screen.getByPlaceholderText('Tell the agent what to change...') as HTMLTextAreaElement

      const dataTransfer = {
        types: ['app/path'],
        getData: (type: string) => (type === 'app/path' ? 'src/main.ts' : ''),
        dropEffect: '',
      }
      const column = composer.parentElement as HTMLElement
      fireEvent.drop(column, { dataTransfer })

      expect(composer).toHaveValue('@src/main.ts ')
    })
  })
})
