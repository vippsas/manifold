import React, { useRef } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { FileTreeNode } from '../../../shared/types'
import type { VisibleNode } from './file-tree-visible'
import { useFileTreeKeyboard } from './useFileTreeKeyboard'
import { useFileTreeSelection } from './useFileTreeSelection'

function file(name: string, path: string): FileTreeNode {
  return { name, path, isDirectory: false }
}

const NODES: VisibleNode[] = [
  { node: file('alpha.ts', '/alpha.ts'), depth: 0, parentPath: null },
  { node: file('beta.ts', '/beta.ts'), depth: 0, parentPath: null },
  { node: file('gamma.ts', '/gamma.ts'), depth: 0, parentPath: null },
]

function Harness({ onOpenFile, onRename, onPaste }: {
  onOpenFile?: (p: string) => void
  onRename?: (n: FileTreeNode) => void
  onPaste?: () => void
}): React.JSX.Element {
  const selection = useFileTreeSelection()
  const containerRef = useRef<HTMLDivElement>(null)
  const { onKeyDown } = useFileTreeKeyboard({
    visibleNodes: NODES,
    selection,
    expandedPaths: new Set(),
    containerRef,
    onToggleExpand: vi.fn(),
    onOpenFile: onOpenFile ?? vi.fn(),
    onRename,
    onPaste,
  })
  return (
    <div ref={containerRef} tabIndex={0} onKeyDown={onKeyDown} data-testid="tree" data-cursor={selection.cursorPath ?? ''}>
      {NODES.map((v) => (
        <div key={v.node.path} data-tree-path={v.node.path} tabIndex={0}>{v.node.name}</div>
      ))}
    </div>
  )
}

describe('useFileTreeKeyboard', () => {
  it('ArrowDown moves the cursor down the visible list', () => {
    const { getByTestId } = render(<Harness />)
    const tree = getByTestId('tree')
    fireEvent.keyDown(tree, { key: 'ArrowDown' })
    expect(tree.getAttribute('data-cursor')).toBe('/alpha.ts')
    fireEvent.keyDown(tree, { key: 'ArrowDown' })
    expect(tree.getAttribute('data-cursor')).toBe('/beta.ts')
  })

  it('ArrowUp stops at the top', () => {
    const { getByTestId } = render(<Harness />)
    const tree = getByTestId('tree')
    fireEvent.keyDown(tree, { key: 'End' })
    expect(tree.getAttribute('data-cursor')).toBe('/gamma.ts')
    fireEvent.keyDown(tree, { key: 'ArrowUp' })
    fireEvent.keyDown(tree, { key: 'ArrowUp' })
    fireEvent.keyDown(tree, { key: 'ArrowUp' })
    expect(tree.getAttribute('data-cursor')).toBe('/alpha.ts')
  })

  it('Enter opens the file under the cursor', () => {
    const onOpenFile = vi.fn()
    const { getByTestId } = render(<Harness onOpenFile={onOpenFile} />)
    const tree = getByTestId('tree')
    fireEvent.keyDown(tree, { key: 'ArrowDown' })
    fireEvent.keyDown(tree, { key: 'Enter' })
    expect(onOpenFile).toHaveBeenCalledWith('/alpha.ts')
  })

  it('F2 renames the node under the cursor', () => {
    const onRename = vi.fn()
    const { getByTestId } = render(<Harness onRename={onRename} />)
    const tree = getByTestId('tree')
    fireEvent.keyDown(tree, { key: 'ArrowDown' })
    fireEvent.keyDown(tree, { key: 'F2' })
    expect(onRename).toHaveBeenCalledWith(NODES[0].node)
  })

  it('type-ahead jumps to the next matching name', () => {
    const { getByTestId } = render(<Harness />)
    const tree = getByTestId('tree')
    fireEvent.keyDown(tree, { key: 'g' })
    expect(tree.getAttribute('data-cursor')).toBe('/gamma.ts')
  })

  it('invokes paste on Cmd+V', () => {
    const onPaste = vi.fn()
    const { getByTestId } = render(<Harness onPaste={onPaste} />)
    const tree = getByTestId('tree')
    fireEvent.keyDown(tree, { key: 'v', metaKey: true })
    expect(onPaste).toHaveBeenCalled()
  })
})
