import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { FileTreeNode } from '../../../shared/types'
import { TreeNode } from './tree-node'

function makeFileNode(overrides: Partial<FileTreeNode> = {}): FileTreeNode {
  return {
    name: 'index.ts',
    path: '/repo/src/index.ts',
    isDirectory: false,
    ...overrides,
  }
}

function renderTreeNode({
  node = makeFileNode(),
  openFilePaths = new Set<string>(),
  onHighlightFile = vi.fn(),
  onSelectFile = vi.fn(),
}: {
  node?: FileTreeNode
  openFilePaths?: Set<string>
  onHighlightFile?: (path: string) => void
  onSelectFile?: (path: string) => void
} = {}) {
  render(
    <TreeNode
      node={node}
      depth={0}
      changeMap={new Map()}
      activeFilePath={null}
      selectedFilePath={null}
      openFilePaths={openFilePaths}
      expandedPaths={new Set()}
      onToggleExpand={vi.fn()}
      onHighlightFile={onHighlightFile}
      onSelectFile={onSelectFile}
      renamingPath={null}
      renameValue=""
      onRenameValueChange={vi.fn()}
      onConfirmRename={vi.fn()}
      onCancelRename={vi.fn()}
    />
  )

  return {
    onHighlightFile,
    onSelectFile,
    row: screen.getByTitle(node.path),
  }
}

describe('TreeNode', () => {
  it('selects an already-open file on single click', () => {
    const node = makeFileNode()
    const onHighlightFile = vi.fn()
    const onSelectFile = vi.fn()
    const { row } = renderTreeNode({
      node,
      openFilePaths: new Set([node.path]),
      onHighlightFile,
      onSelectFile,
    })

    fireEvent.click(row)

    expect(onHighlightFile).toHaveBeenCalledWith(node.path)
    expect(onSelectFile).toHaveBeenCalledWith(node.path)
  })

  it('keeps unopened files on highlight until double click', () => {
    const node = makeFileNode()
    const onSelectFile = vi.fn()
    const { row } = renderTreeNode({ node, onSelectFile })

    fireEvent.click(row)
    expect(onSelectFile).not.toHaveBeenCalled()

    fireEvent.doubleClick(row)
    expect(onSelectFile).toHaveBeenCalledWith(node.path)
  })
})
