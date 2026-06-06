import { describe, expect, it, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TerminalPane } from './TerminalPane'
import { FILE_TREE_DRAG_MIME } from '../editor/file-tree-drag'

const focusTerminal = vi.fn()
const getPathForFile = vi.fn()

vi.mock('../../hooks/useTerminal', () => ({
  useTerminal: () => ({
    containerRef: { current: null },
    focusTerminal,
  }),
}))

function createMockDataTransfer(options: { payload?: string; files?: File[] } = {}): DataTransfer {
  const values = new Map<string, string>()
  if (options.payload) values.set(FILE_TREE_DRAG_MIME, options.payload)
  const types = Array.from(values.keys())
  if (options.files?.length) types.push('Files')

  return {
    dropEffect: 'none',
    effectAllowed: 'all',
    files: (options.files ?? []) as unknown as FileList,
    items: {} as DataTransferItemList,
    types,
    clearData: vi.fn(),
    getData: vi.fn((format: string) => values.get(format) ?? ''),
    setData: vi.fn(),
    setDragImage: vi.fn(),
  } as unknown as DataTransfer
}

describe('TerminalPane', () => {
  beforeEach(() => {
    focusTerminal.mockReset()
    getPathForFile.mockReset()
    ;(window as unknown as Record<string, unknown>).electronAPI = {
      invoke: vi.fn().mockResolvedValue(undefined),
      send: vi.fn(),
      on: vi.fn(() => () => {}),
      getPathForFile,
    }
  })

  it('writes a dropped file-tree path into the active agent session', () => {
    const { container } = render(
      <TerminalPane sessionId="session-1" scrollbackLines={5000} />
    )
    const wrapper = container.firstChild as HTMLDivElement
    const dataTransfer = createMockDataTransfer({ payload: 'src/components/FileTree.tsx' })

    fireEvent.dragEnter(wrapper, { dataTransfer })
    expect(screen.getByText('Drop to insert path')).toBeInTheDocument()

    fireEvent.drop(wrapper, { dataTransfer })

    expect(window.electronAPI.invoke).toHaveBeenCalledWith('agent:input', 'session-1', 'src/components/FileTree.tsx')
    expect(focusTerminal).toHaveBeenCalled()
  })

  it('writes dropped external paths into the active agent session', () => {
    const { container } = render(
      <TerminalPane sessionId="session-1" scrollbackLines={5000} />
    )
    const wrapper = container.firstChild as HTMLDivElement
    const file = new File(['notes'], 'notes.txt')
    const folder = new File([], 'Adam Project')
    const dataTransfer = createMockDataTransfer({ files: [file, folder] })
    getPathForFile.mockImplementation((droppedFile: File) => {
      if (droppedFile === file) return '/tmp/notes.txt'
      return "/Users/adam/Project Files/O'Brien"
    })

    fireEvent.dragOver(wrapper, { dataTransfer })
    expect(dataTransfer.dropEffect).toBe('copy')

    fireEvent.drop(wrapper, { dataTransfer })

    expect(window.electronAPI.invoke).toHaveBeenCalledWith(
      'agent:input',
      'session-1',
      "/tmp/notes.txt '/Users/adam/Project Files/O'\\''Brien'",
    )
    expect(focusTerminal).toHaveBeenCalled()
  })

  it('ignores drops without path data', () => {
    const { container } = render(
      <TerminalPane sessionId="session-1" scrollbackLines={5000} />
    )
    const wrapper = container.firstChild as HTMLDivElement

    fireEvent.dragOver(wrapper, { dataTransfer: createMockDataTransfer() })
    fireEvent.drop(wrapper, { dataTransfer: createMockDataTransfer() })

    expect(window.electronAPI.invoke).not.toHaveBeenCalled()
  })
})
