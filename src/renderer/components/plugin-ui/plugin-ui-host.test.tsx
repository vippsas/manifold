import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { PluginUiHost } from './PluginUiHost'
import type { UiRequest } from '../../../shared/plugins/ui'

// ---- electronAPI mock -------------------------------------------------------

const mockInvoke = vi.fn()
// mockOn captures the handler so tests can fire events
type Listener = (req: UiRequest) => void
let capturedListeners: Map<string, Listener[]> = new Map()

const mockOn = vi.fn((channel: string, cb: Listener) => {
  const list = capturedListeners.get(channel) ?? []
  list.push(cb)
  capturedListeners.set(channel, list)
  return () => {
    const l = capturedListeners.get(channel) ?? []
    capturedListeners.set(channel, l.filter((fn) => fn !== cb))
  }
})

function fireUiRequest(req: UiRequest): void {
  const listeners = capturedListeners.get('plugins:ui-request') ?? []
  for (const fn of listeners) fn(req)
}

beforeEach(() => {
  vi.clearAllMocks()
  capturedListeners = new Map()
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: mockOn,
  }
})

// ---- helpers ----------------------------------------------------------------

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

// ---- tests ------------------------------------------------------------------

describe('PluginUiHost', () => {
  describe('inputBox', () => {
    it('shows an input box and responds with the typed value on OK', async () => {
      render(<PluginUiHost />)
      await flush()

      act(() => {
        fireUiRequest({
          requestId: 'u1',
          kind: 'inputBox',
          options: { prompt: 'Name?' },
        })
      })

      // Prompt label should appear
      expect(screen.getByText('Name?')).toBeInTheDocument()

      // Type in the input
      const input = screen.getByRole('textbox')
      fireEvent.change(input, { target: { value: 'Daisy' } })
      expect(input).toHaveValue('Daisy')

      // Click OK
      fireEvent.click(screen.getByRole('button', { name: 'OK' }))

      expect(mockInvoke).toHaveBeenCalledWith('plugins:ui-response', 'u1', 'Daisy')
    })

    it('responds with undefined on Cancel', async () => {
      render(<PluginUiHost />)
      await flush()

      act(() => {
        fireUiRequest({
          requestId: 'u1b',
          kind: 'inputBox',
          options: { prompt: 'Confirm?' },
        })
      })

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(mockInvoke).toHaveBeenCalledWith('plugins:ui-response', 'u1b', undefined)
    })

    it('responds with undefined on Escape', async () => {
      render(<PluginUiHost />)
      await flush()

      act(() => {
        fireUiRequest({
          requestId: 'u1c',
          kind: 'inputBox',
          options: {},
        })
      })

      const input = screen.getByRole('textbox')
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(mockInvoke).toHaveBeenCalledWith('plugins:ui-response', 'u1c', undefined)
    })

    it('submits value on Enter key', async () => {
      render(<PluginUiHost />)
      await flush()

      act(() => {
        fireUiRequest({
          requestId: 'u1d',
          kind: 'inputBox',
          options: { value: 'prefilled' },
        })
      })

      const input = screen.getByRole('textbox')
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(mockInvoke).toHaveBeenCalledWith('plugins:ui-response', 'u1d', 'prefilled')
    })

    it('responds with undefined on backdrop click', async () => {
      render(<PluginUiHost />)
      await flush()

      act(() => {
        fireUiRequest({
          requestId: 'u1e',
          kind: 'inputBox',
          options: { prompt: 'Name?' },
        })
      })

      // The backdrop is the dialog overlay; clicking it (target === overlay) cancels.
      fireEvent.click(screen.getByRole('dialog'))

      expect(mockInvoke).toHaveBeenCalledWith('plugins:ui-response', 'u1e', undefined)
    })
  })

  describe('quickPick', () => {
    it('shows items and responds with the clicked item', async () => {
      render(<PluginUiHost />)
      await flush()

      act(() => {
        fireUiRequest({
          requestId: 'u2',
          kind: 'quickPick',
          items: [{ label: 'Red' }, { label: 'Green' }],
          options: {},
        })
      })

      // Both items should appear
      expect(screen.getByText('Red')).toBeInTheDocument()
      expect(screen.getByText('Green')).toBeInTheDocument()

      // Click Green
      fireEvent.click(screen.getByText('Green'))

      expect(mockInvoke).toHaveBeenCalledWith('plugins:ui-response', 'u2', { label: 'Green' })
    })

    it('filters items by label', async () => {
      render(<PluginUiHost />)
      await flush()

      act(() => {
        fireUiRequest({
          requestId: 'u2b',
          kind: 'quickPick',
          items: [{ label: 'Apple' }, { label: 'Banana' }, { label: 'Cherry' }],
          options: { placeholder: 'Pick a fruit' },
        })
      })

      const filterInput = screen.getByRole('textbox')
      fireEvent.change(filterInput, { target: { value: 'ban' } })

      expect(screen.queryByText('Apple')).not.toBeInTheDocument()
      expect(screen.getByText('Banana')).toBeInTheDocument()
      expect(screen.queryByText('Cherry')).not.toBeInTheDocument()
    })

    it('responds with undefined on Escape', async () => {
      render(<PluginUiHost />)
      await flush()

      act(() => {
        fireUiRequest({
          requestId: 'u2c',
          kind: 'quickPick',
          items: [{ label: 'X' }],
          options: {},
        })
      })

      const filterInput = screen.getByRole('textbox')
      fireEvent.keyDown(filterInput, { key: 'Escape' })

      expect(mockInvoke).toHaveBeenCalledWith('plugins:ui-response', 'u2c', undefined)
    })

    it('navigates with arrow keys and picks on Enter', async () => {
      render(<PluginUiHost />)
      await flush()

      act(() => {
        fireUiRequest({
          requestId: 'u2d',
          kind: 'quickPick',
          items: [{ label: 'First' }, { label: 'Second' }],
          options: {},
        })
      })

      const filterInput = screen.getByRole('textbox')
      // Move down to second item (index 1) and pick with Enter
      fireEvent.keyDown(filterInput, { key: 'ArrowDown' })
      fireEvent.keyDown(filterInput, { key: 'Enter' })

      expect(mockInvoke).toHaveBeenCalledWith('plugins:ui-response', 'u2d', { label: 'Second' })
    })

    it('cancels (undefined) on Enter when the filter matches nothing', async () => {
      render(<PluginUiHost />)
      await flush()

      act(() => {
        fireUiRequest({
          requestId: 'u2e',
          kind: 'quickPick',
          items: [{ label: 'Alpha' }, { label: 'Beta' }],
          options: {},
        })
      })

      const filterInput = screen.getByRole('textbox')
      // Non-matching filter → empty list; Enter must resolve undefined, not hang.
      fireEvent.change(filterInput, { target: { value: 'zzzzz' } })
      fireEvent.keyDown(filterInput, { key: 'Enter' })

      expect(mockInvoke).toHaveBeenCalledWith('plugins:ui-response', 'u2e', undefined)
    })

    it('responds with undefined on backdrop click', async () => {
      render(<PluginUiHost />)
      await flush()

      act(() => {
        fireUiRequest({
          requestId: 'u2f',
          kind: 'quickPick',
          items: [{ label: 'OnlyItem' }],
          options: {},
        })
      })

      // The backdrop is the dialog overlay; clicking it (target === overlay) cancels.
      fireEvent.click(screen.getByRole('dialog'))

      expect(mockInvoke).toHaveBeenCalledWith('plugins:ui-response', 'u2f', undefined)
    })
  })

  describe('message toast with actions', () => {
    it('shows a toast and responds with the clicked action label', async () => {
      render(<PluginUiHost />)
      await flush()

      act(() => {
        fireUiRequest({
          requestId: 'u3',
          kind: 'message',
          level: 'info',
          message: 'Hi',
          actions: ['Ok', 'Cancel'],
        })
      })

      // Toast message should appear
      expect(screen.getByText('Hi')).toBeInTheDocument()

      // Action buttons should appear
      expect(screen.getByRole('button', { name: 'Ok' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

      // Click Ok
      fireEvent.click(screen.getByRole('button', { name: 'Ok' }))

      expect(mockInvoke).toHaveBeenCalledWith('plugins:ui-response', 'u3', 'Ok')
    })

    it('dismisses toast with × button responding undefined', async () => {
      render(<PluginUiHost />)
      await flush()

      act(() => {
        fireUiRequest({
          requestId: 'u3b',
          kind: 'message',
          level: 'warning',
          message: 'Watch out',
          actions: ['Ok'],
        })
      })

      expect(screen.getByText('Watch out')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

      expect(mockInvoke).toHaveBeenCalledWith('plugins:ui-response', 'u3b', undefined)
    })

    it('auto-dismisses an action-less toast after 5s (responds undefined)', async () => {
      vi.useFakeTimers()
      try {
        render(<PluginUiHost />)
        await act(async () => {
          await Promise.resolve()
        })

        act(() => {
          fireUiRequest({
            requestId: 'u3c',
            kind: 'message',
            level: 'info',
            message: 'Auto bye',
            actions: [],
          })
        })

        expect(screen.getByText('Auto bye')).toBeInTheDocument()
        expect(mockInvoke).not.toHaveBeenCalled()

        // Advance past the 5s auto-dismiss window.
        act(() => {
          vi.advanceTimersByTime(5000)
        })

        expect(mockInvoke).toHaveBeenCalledWith('plugins:ui-response', 'u3c', undefined)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('modal queue', () => {
    it('shows only the first modal at a time and advances after response', async () => {
      render(<PluginUiHost />)
      await flush()

      act(() => {
        fireUiRequest({
          requestId: 'q1',
          kind: 'inputBox',
          options: { title: 'First' },
        })
        fireUiRequest({
          requestId: 'q2',
          kind: 'inputBox',
          options: { title: 'Second' },
        })
      })

      // Only first should be visible
      expect(screen.getByRole('dialog', { name: 'First' })).toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: 'Second' })).not.toBeInTheDocument()

      // Submit first
      fireEvent.click(screen.getByRole('button', { name: 'OK' }))

      // Now second should appear
      expect(screen.getByRole('dialog', { name: 'Second' })).toBeInTheDocument()
    })
  })
})
