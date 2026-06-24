import type React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { FileTreeNode } from '../../../../shared/types'
import { TreeNode, type TreeChangeEntry } from './tree-node'

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
  changeMap = new Map<string, TreeChangeEntry>(),
  openFilePaths = new Set<string>(),
  onRowClick = vi.fn(),
  onStartRename = vi.fn(),
}: {
  node?: FileTreeNode
  changeMap?: Map<string, TreeChangeEntry>
  openFilePaths?: Set<string>
  onRowClick?: (e: React.MouseEvent, node: FileTreeNode) => void
  onStartRename?: (path: string, name: string) => void
} = {}) {
  render(
    <TreeNode
      node={node}
      depth={0}
      changeMap={changeMap}
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

  it('renders the change letter for a direct working-tree change', () => {
    const node = makeFileNode()
    renderTreeNode({
      node,
      changeMap: new Map([[node.path, { type: 'added', worktreeDirty: true }]]),
    })

    expect(screen.getByText('A')).toBeTruthy()
    expect(screen.queryByText('○')).toBeNull()
  })

  it('renders a faint dot instead of a letter for a branch-only change', () => {
    const node = makeFileNode()
    renderTreeNode({
      node,
      changeMap: new Map([[node.path, { type: 'added', worktreeDirty: false }]]),
    })

    expect(screen.queryByText('A')).toBeNull()
    expect(screen.getByText('○')).toBeTruthy()
  })
})
