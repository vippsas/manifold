import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TerminalPane } from './TerminalPane'
import { FILE_TREE_DRAG_MIME } from '../editor/file-tree-drag'

const focusTerminal = vi.fn()

vi.mock('../../hooks/useTerminal', () => ({
  useTerminal: () => ({
    containerRef: { current: null },
    focusTerminal,
  }),
}))

function createMockDataTransfer(payload?: string): DataTransfer {
  const values = new Map<string, string>()
  if (payload) values.set(FILE_TREE_DRAG_MIME, payload)

  return {
    dropEffect: 'none',
    effectAllowed: 'all',
    files: {} as FileList,
    items: {} as DataTransferItemList,
    types: Array.from(values.keys()),
    clearData: vi.fn(),
    getData: vi.fn((format: string) => values.get(format) ?? ''),
    setData: vi.fn(),
    setDragImage: vi.fn(),
  } as unknown as DataTransfer
}

describe('TerminalPane', () => {
  beforeEach(() => {
    focusTerminal.mockReset()
    ;(window as unknown as Record<string, unknown>).electronAPI = {
      invoke: vi.fn().mockResolvedValue(undefined),
      send: vi.fn(),
      on: vi.fn(() => () => {}),
      getPathForFile: vi.fn(),
    }
  })

  it('writes a dropped file-tree path into the active agent session', () => {
    const { container } = render(
      <TerminalPane sessionId="session-1" scrollbackLines={5000} />
    )
    const wrapper = container.firstChild as HTMLDivElement
    const dataTransfer = createMockDataTransfer('src/components/FileTree.tsx')

    fireEvent.dragEnter(wrapper, { dataTransfer })
    expect(screen.getByText('Drop to insert relative path')).toBeInTheDocument()

    fireEvent.drop(wrapper, { dataTransfer })

    expect(window.electronAPI.invoke).toHaveBeenCalledWith('agent:input', 'session-1', 'src/components/FileTree.tsx')
    expect(focusTerminal).toHaveBeenCalled()
  })

  it('ignores drops that do not come from the file tree', () => {
    const { container } = render(
      <TerminalPane sessionId="session-1" scrollbackLines={5000} />
    )
    const wrapper = container.firstChild as HTMLDivElement

    fireEvent.dragOver(wrapper, { dataTransfer: createMockDataTransfer() })
    fireEvent.drop(wrapper, { dataTransfer: createMockDataTransfer() })

    expect(window.electronAPI.invoke).not.toHaveBeenCalled()
  })
})
