import type React from 'react'
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
  onRowClick = vi.fn(),
  onStartRename = vi.fn(),
}: {
  node?: FileTreeNode
  openFilePaths?: Set<string>
  onRowClick?: (e: React.MouseEvent, node: FileTreeNode) => void
  onStartRename?: (path: string, name: string) => void
} = {}) {
  render(
    <TreeNode
      node={node}
      depth={0}
      changeMap={new Map()}
      activeFilePath={null}
      selectedPaths={new Set()}
      openFilePaths={openFilePaths}
      expandedPaths={new Set()}
      onRowClick={onRowClick}
      renamingPath={null}
      renameValue=""
      onRenameValueChange={vi.fn()}
      onConfirmRename={vi.fn()}
      onCancelRename={vi.fn()}
      onStartRename={onStartRename}
    />
  )

  return {
    onRowClick,
    onStartRename,
    row: screen.getByTitle(node.path),
  }
}

describe('TreeNode', () => {
  it('delegates single click to onRowClick with the node', () => {
    const node = makeFileNode()
    const onRowClick = vi.fn()
    const { row } = renderTreeNode({ node, onRowClick })

    fireEvent.click(row)

    expect(onRowClick).toHaveBeenCalledTimes(1)
    expect(onRowClick.mock.calls[0][1]).toEqual(node)
  })

  it('starts rename on double click', () => {
    const node = makeFileNode()
    const onStartRename = vi.fn()
    const { row } = renderTreeNode({ node, onStartRename })

    fireEvent.doubleClick(row)

    expect(onStartRename).toHaveBeenCalledWith(node.path, node.name)
  })

  it('starts rename on double click for directories', () => {
    const node = makeFileNode({ name: 'src', path: '/repo/src', isDirectory: true, children: [] })
    const onStartRename = vi.fn()
    const { row } = renderTreeNode({ node, onStartRename })

    fireEvent.doubleClick(row)

    expect(onStartRename).toHaveBeenCalledWith(node.path, node.name)
  })
})
