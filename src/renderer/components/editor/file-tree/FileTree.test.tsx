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

/** The sidebar's shape: the root row is flattened away, so its children are the
 *  tree's top level. */
function renderFlattenedRoot(onDeleteFile?: (path: string) => void) {
  const tree = dir('repo', '/repo', [
    dir('.claude', '/repo/.claude', [file('settings.json', '/repo/.claude/settings.json')]),
    file('README.md', '/repo/README.md'),
  ])
  const result = render(
    <FileTree
      showToolbar={false}
      flattenRoots
      tree={tree}
      changes={[]}
      activeFilePath={null}
      openFilePaths={new Set()}
      expandedPaths={new Set(['/repo', '/repo/.claude'])}
      onToggleExpand={vi.fn()}
      onSelectFile={vi.fn()}
      onCreateFile={vi.fn(async () => true)}
      onCreateDir={vi.fn(async () => true)}
      onDeleteFile={onDeleteFile}
      worktreeRootPath="/repo"
    />
  )
  const rightClick = (path: string): void => {
    const row = result.container.querySelector(`[data-tree-path="${path}"]`)
    if (!row) throw new Error(`no row for ${path}`)
    fireEvent.contextMenu(row)
  }
  return { ...result, rightClick }
}

// The flattened root has no row of its own, so the create input it hosts had
// nowhere to render: "New File" on a top-level entry looked like a dead menu.
describe('FileTree create under a flattened root', () => {
  it('prompts for a name when the target sits at the root', () => {
    const { rightClick } = renderFlattenedRoot()

    rightClick('/repo/README.md')
    fireEvent.click(screen.getByText('New File'))

    expect(screen.getByPlaceholderText('filename')).toBeTruthy()
  })

  it('prompts for a name when the target is the root itself (empty space)', () => {
    const { container } = renderFlattenedRoot()

    const treeContainer = container.querySelector('[data-tree-root-path="/repo"]')?.parentElement
    if (!treeContainer) throw new Error('expected a tree container')
    fireEvent.contextMenu(treeContainer)
    fireEvent.click(screen.getByText('New Folder'))

    expect(screen.getByPlaceholderText('folder name')).toBeTruthy()
  })

  it('still prompts for a name inside a nested directory', () => {
    const { rightClick } = renderFlattenedRoot()

    rightClick('/repo/.claude/settings.json')
    fireEvent.click(screen.getByText('New File'))

    expect(screen.getByPlaceholderText('filename')).toBeTruthy()
  })
})

describe('FileTree delete affordance', () => {
  it('offers delete in the context menu without rendering a row-level trash button', () => {
    const onDeleteFile = vi.fn()
    const { rightClick } = renderFlattenedRoot(onDeleteFile)

    expect(screen.queryByTitle('Delete')).toBeNull()

    rightClick('/repo/README.md')
    fireEvent.click(screen.getByText('Delete'))

    expect(screen.getByText('Delete file')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDeleteFile).toHaveBeenCalledWith('/repo/README.md')
  })
})

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

// A collapsed folder used to hide every change under it: the letters were on the
// file rows, and nothing on the way down said "look in here".
describe('FileTree folder change roll-up', () => {
  function renderCollapsedFolders(changes: Parameters<typeof FileTree>[0]['changes']) {
    const tree = dir('repo', '/repo', [
      dir('src', '/repo/src', [file('index.ts', '/repo/src/index.ts')]),
      dir('docs', '/repo/docs', [file('guide.md', '/repo/docs/guide.md')]),
    ])
    return render(
      <FileTree
        showToolbar={false}
        flattenRoots
        tree={tree}
        changes={changes}
        activeFilePath={null}
        openFilePaths={new Set()}
        expandedPaths={new Set(['/repo'])}
        onToggleExpand={vi.fn()}
        onSelectFile={vi.fn()}
      />
    )
  }

  function rowFor(container: HTMLElement, path: string): HTMLElement {
    const row = container.querySelector<HTMLElement>(`[data-tree-path="${path}"]`)
    if (!row) throw new Error(`expected a row for ${path}`)
    return row
  }

  it('marks a collapsed folder that holds a working-tree change', () => {
    const { container } = renderCollapsedFolders([{ path: 'src/index.ts', type: 'modified' }])

    expect(rowFor(container, '/repo/src')).toHaveTextContent('●')
    expect(screen.getByTitle('1 changed file inside')).toBeInTheDocument()
    // Only the folder that holds it.
    expect(rowFor(container, '/repo/docs')).not.toHaveTextContent('●')
  })

  it('counts what is inside', () => {
    const { container } = renderCollapsedFolders([
      { path: 'src/index.ts', type: 'modified' },
      { path: 'src/added.ts', type: 'added' },
    ])

    expect(rowFor(container, '/repo/src')).toBeInTheDocument()
    expect(screen.getByTitle('2 changed files inside')).toBeInTheDocument()
  })

  // Same distinction the file rows draw: a vivid mark for work in the tree now,
  // a faint one for what only differs from the base branch.
  it('recedes for a folder holding only branch-only changes', () => {
    const { container } = renderCollapsedFolders([
      { path: 'docs/guide.md', type: 'modified', worktreeDirty: false },
    ])

    const row = rowFor(container, '/repo/docs')
    expect(row).toHaveTextContent('○')
    expect(row).not.toHaveTextContent('●')
  })

  it('leaves a folder with nothing inside it unmarked', () => {
    const { container } = renderCollapsedFolders([])

    expect(rowFor(container, '/repo/src')).not.toHaveTextContent('●')
    expect(rowFor(container, '/repo/docs')).not.toHaveTextContent('●')
  })
})
