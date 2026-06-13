import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FileTreeNode } from '../../../../shared/types'
import { FileTree, ERROR_BANNER_TIMEOUT_MS } from './FileTree'
import { FILE_TREE_MOVE_MIME } from './file-tree-drag'

function dir(name: string, path: string, children: FileTreeNode[] = []): FileTreeNode {
  return { name, path, isDirectory: true, children }
}

function file(name: string, path: string): FileTreeNode {
  return { name, path, isDirectory: false }
}

/** A DataTransfer carrying an internal move drag from /repoA. */
function crossWorktreeMoveTransfer(): DataTransfer {
  const values = new Map<string, string>([
    [FILE_TREE_MOVE_MIME, JSON.stringify({ sourcePath: '/repoA/a.ts', rootPath: '/repoA', isDirectory: false })],
  ])
  return {
    dropEffect: 'none',
    effectAllowed: 'copyMove',
    types: Array.from(values.keys()),
    getData: (format: string) => values.get(format) ?? '',
    setData: vi.fn(),
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
  } as unknown as DataTransfer
}

function renderTwoWorktrees(onMovePath = vi.fn(async () => null)) {
  const tree = dir('repoA', '/repoA', [file('a.ts', '/repoA/a.ts')])
  const additionalTrees = new Map<string, FileTreeNode>([
    ['/repoB', dir('repoB', '/repoB', [file('b.ts', '/repoB/b.ts')])],
  ])
  const result = render(
    <FileTree
      tree={tree}
      additionalTrees={additionalTrees}
      changes={[]}
      activeFilePath={null}
      openFilePaths={new Set()}
      expandedPaths={new Set(['/repoA', '/repoB'])}
      onToggleExpand={vi.fn()}
      onSelectFile={vi.fn()}
      onMovePath={onMovePath}
      worktreeRootPath="/repoA"
    />
  )
  const rootB = result.container.querySelector('[data-tree-root-path="/repoB"]')
  if (!rootB) throw new Error('expected a /repoB root container')
  return { ...result, onMovePath, rootB }
}

describe('FileTree cross-worktree move error banner', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('surfaces the validation error when a move crosses worktrees', async () => {
    const { rootB, onMovePath } = renderTwoWorktrees()

    fireEvent.drop(rootB, { dataTransfer: crossWorktreeMoveTransfer() })

    await waitFor(() => {
      expect(screen.getByText('Cannot move across worktrees.')).toBeTruthy()
    })
    expect(onMovePath).not.toHaveBeenCalled()
  })

  it('lets the user dismiss the error banner immediately', async () => {
    const { rootB } = renderTwoWorktrees()

    fireEvent.drop(rootB, { dataTransfer: crossWorktreeMoveTransfer() })
    await waitFor(() => screen.getByText('Cannot move across worktrees.'))

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))

    expect(screen.queryByText('Cannot move across worktrees.')).toBeNull()
  })

  it('auto-dismisses the error banner after a timeout', async () => {
    vi.useFakeTimers()
    const { rootB } = renderTwoWorktrees()

    await act(async () => {
      fireEvent.drop(rootB, { dataTransfer: crossWorktreeMoveTransfer() })
    })
    expect(screen.getByText('Cannot move across worktrees.')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(ERROR_BANNER_TIMEOUT_MS)
    })

    expect(screen.queryByText('Cannot move across worktrees.')).toBeNull()
  })

  it('keeps the file tree usable while the error banner is shown', async () => {
    const { rootB } = renderTwoWorktrees()

    fireEvent.drop(rootB, { dataTransfer: crossWorktreeMoveTransfer() })
    await waitFor(() => screen.getByText('Cannot move across worktrees.'))

    // The tree contents stay rendered behind the banner, not replaced by it.
    expect(screen.getByText('a.ts')).toBeTruthy()
    expect(screen.getByText('b.ts')).toBeTruthy()
  })
})
