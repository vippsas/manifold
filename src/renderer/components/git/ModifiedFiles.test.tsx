import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { ModifiedFiles } from './ModifiedFiles'
import type { FileChange } from '../../../shared/types'
import { AGENT_PATH_DRAG_MIME } from '../editor/file-tree-drag'

function createMockDataTransfer(): DataTransfer {
  return {
    dropEffect: 'none',
    effectAllowed: 'all',
    files: {} as FileList,
    items: {} as DataTransferItemList,
    types: [],
    clearData: vi.fn(),
    getData: vi.fn(),
    setData: vi.fn(),
    setDragImage: vi.fn(),
  } as unknown as DataTransfer
}

describe('ModifiedFiles', () => {
  const mockOnSelectFile = vi.fn()
  const worktreeRoot = '/workspace/project'

  const sampleChanges: FileChange[] = [
    { path: 'src/index.ts', type: 'modified' },
    { path: 'src/utils/helpers.ts', type: 'added' },
    { path: 'old-file.ts', type: 'deleted' },
  ]

  beforeEach(() => {
    mockOnSelectFile.mockClear()
  })

  it('renders all changed files', () => {
    render(
      <ModifiedFiles
        changes={sampleChanges}
        activeFilePath={null}
        worktreeRoot={worktreeRoot}
        onSelectFile={mockOnSelectFile}
      />,
    )
    expect(screen.getByText('index.ts')).toBeInTheDocument()
    expect(screen.getByText('helpers.ts')).toBeInTheDocument()
    expect(screen.getByText('old-file.ts')).toBeInTheDocument()
  })

  it('renders each changed file', () => {
    render(
      <ModifiedFiles
        changes={sampleChanges}
        activeFilePath={null}
        worktreeRoot={worktreeRoot}
        onSelectFile={mockOnSelectFile}
      />,
    )
    expect(screen.getByText('index.ts')).toBeInTheDocument()
    expect(screen.getByText('helpers.ts')).toBeInTheDocument()
    expect(screen.getByText('old-file.ts')).toBeInTheDocument()
  })

  it('calls onSelectFile with absolute path on click', () => {
    render(
      <ModifiedFiles
        changes={sampleChanges}
        activeFilePath={null}
        worktreeRoot={worktreeRoot}
        onSelectFile={mockOnSelectFile}
      />,
    )
    fireEvent.click(screen.getByText('index.ts'))
    expect(mockOnSelectFile).toHaveBeenCalledWith('/workspace/project/src/index.ts')
  })

  it('highlights the active file', () => {
    render(
      <ModifiedFiles
        changes={sampleChanges}
        activeFilePath="/workspace/project/src/index.ts"
        worktreeRoot={worktreeRoot}
        onSelectFile={mockOnSelectFile}
      />,
    )
    const row = screen.getByText('index.ts').closest('[role="button"]')
    expect(row?.getAttribute('data-active')).toBe('true')
  })

  it('shows empty state when no changes', () => {
    render(
      <ModifiedFiles
        changes={[]}
        activeFilePath={null}
        worktreeRoot={worktreeRoot}
        onSelectFile={mockOnSelectFile}
      />,
    )
    expect(screen.getByText('No changes')).toBeInTheDocument()
  })

  it('sorts by type: modified first, then added, then deleted', () => {
    const mixed: FileChange[] = [
      { path: 'z-deleted.ts', type: 'deleted' },
      { path: 'a-added.ts', type: 'added' },
      { path: 'm-modified.ts', type: 'modified' },
    ]
    render(
      <ModifiedFiles
        changes={mixed}
        activeFilePath={null}
        worktreeRoot={worktreeRoot}
        onSelectFile={mockOnSelectFile}
      />,
    )
    const rows = screen.getAllByRole('button')
    expect(rows[0].textContent).toContain('m-modified.ts')
    expect(rows[1].textContent).toContain('a-added.ts')
    expect(rows[2].textContent).toContain('z-deleted.ts')
  })

  it('publishes a relative path when a modified file is dragged', () => {
    render(
      <ModifiedFiles
        changes={sampleChanges}
        activeFilePath={null}
        worktreeRoot={worktreeRoot}
        onSelectFile={mockOnSelectFile}
      />,
    )
    const dataTransfer = createMockDataTransfer()
    const row = screen.getByText('index.ts').closest('[role="button"]')

    expect(row).not.toBeNull()
    fireEvent.dragStart(row as Element, { dataTransfer })

    expect(dataTransfer.setData).toHaveBeenCalledWith(AGENT_PATH_DRAG_MIME, 'src/index.ts')
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'src/index.ts')
  })
})
