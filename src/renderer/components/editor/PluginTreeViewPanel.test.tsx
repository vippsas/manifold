import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PluginTreeViewPanel } from './PluginTreeViewPanel'
import type { SerializedTreeItem } from '../../../shared/plugins/tree'

const LEAF_WITH_COMMAND: SerializedTreeItem = {
  nodeId: 'leaf-1',
  label: 'Run Command',
  collapsibleState: 'none',
  command: { command: 'myExtension.boom', args: ['/path'] },
}

describe('PluginTreeViewPanel', () => {
  beforeEach(() => {
    // @ts-expect-error test stub
    global.window.electronAPI = {
      invoke: vi.fn(async () => undefined),
      on: vi.fn(() => () => {}),
    }
  })

  it('logs and does not leak an unhandled rejection when an activated command fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unhandled: unknown[] = []
    const onUnhandled = (e: PromiseRejectionEvent): void => { unhandled.push(e.reason); e.preventDefault() }
    window.addEventListener('unhandledrejection', onUnhandled)
    try {
      const invoke = vi.fn(async (channel: string) => {
        if (channel === 'plugins:open-tree-view') return undefined
        if (channel === 'plugins:tree-get-children') return [LEAF_WITH_COMMAND]
        if (channel === 'plugins:execute-command') throw new Error('command threw')
        return undefined
      })
      // @ts-expect-error test stub
      global.window.electronAPI = { invoke, on: vi.fn(() => () => {}) }

      render(<PluginTreeViewPanel api={{ id: 'view.1' }} />)

      const leaf = await screen.findByText('Run Command')
      fireEvent.click(leaf)

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('plugins:execute-command', 'myExtension.boom', ['/path'])
      })

      // The rejection is caught and logged, not swallowed.
      await waitFor(() => {
        expect(consoleError).toHaveBeenCalled()
      })
      await Promise.resolve()
      expect(unhandled).toEqual([])
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled)
      consoleError.mockRestore()
    }
  })
})
