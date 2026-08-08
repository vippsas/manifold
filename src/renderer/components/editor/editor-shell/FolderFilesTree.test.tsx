// Every folder in the sidebar shows a tree; only the selected agent's worktree
// has a watcher behind it, so the component has to pick the right source.
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { FileTreeNode } from '../../../../shared/types'
import type { DockAppState } from './dock-panel-types'
import { DockStateContext } from './dock-panel-types'
import { clearWorkspaceTreeCache } from '../../../hooks/editor/useWorkspaceTree'
import { FolderFilesTree } from './FolderFilesTree'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  clearWorkspaceTreeCache()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  }
})

function dir(path: string, name: string, children: FileTreeNode[]): FileTreeNode {
  return { path, name, isDirectory: true, children }
}

function file(path: string, name: string): FileTreeNode {
  return { path, name, isDirectory: false }
}

const worktreeTree = dir('/worktrees/oslo', 'oslo', [file('/worktrees/oslo/worktree.ts', 'worktree.ts')])
const checkoutTree = dir('/repos/alpha', 'alpha', [file('/repos/alpha/checkout.ts', 'checkout.ts')])

function makeDockState(overrides: Partial<DockAppState> = {}): DockAppState {
  return {
    sessionId: null,
    openFiles: [],
    activeFilePath: null,
    tree: null,
    changes: [],
    workspaces: [],
    projects: [],
    expandedPaths: new Set<string>(['/worktrees/oslo']),
    onToggleExpand: vi.fn(),
    onSelectFileFromFileTree: vi.fn(),
    onRefreshFileTree: vi.fn(),
    onOpenSearchResultInSplit: vi.fn(),
    ...overrides,
  } as unknown as DockAppState
}

function renderFolder(state: DockAppState, source: Parameters<typeof FolderFilesTree>[0]['source']): void {
  render(
    <DockStateContext.Provider value={state}>
      <FolderFilesTree source={source} />
    </DockStateContext.Provider>,
  )
}

describe('FolderFilesTree', () => {
  it('shows the watched tree for the selected agent’s worktree', () => {
    renderFolder(makeDockState({ sessionId: 's1', tree: worktreeTree }), { kind: 'session', id: 's1' })

    expect(screen.getByText('worktree.ts')).toBeInTheDocument()
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('fetches a repository’s own checkout', async () => {
    mockInvoke.mockResolvedValue(checkoutTree)

    renderFolder(makeDockState({ sessionId: 's1', tree: worktreeTree }), { kind: 'project', id: 'p1' })

    await waitFor(() => expect(screen.getByText('checkout.ts')).toBeInTheDocument())
    expect(mockInvoke).toHaveBeenCalledWith('files:tree-by-project', 'p1', undefined)
  })

  // The same repo is open in several workspaces at once, each with its own
  // checkout of it, so the workspace decides which files these are.
  it('fetches a repository’s checkout inside a workspace', async () => {
    mockInvoke.mockResolvedValue(checkoutTree)

    renderFolder(makeDockState({ sessionId: 's1', tree: worktreeTree }), { kind: 'project', id: 'p1', workspaceId: 'w1' })

    await waitFor(() => expect(screen.getByText('checkout.ts')).toBeInTheDocument())
    expect(mockInvoke).toHaveBeenCalledWith('files:tree-by-project', 'p1', 'w1')
  })

  it('fetches the worktree of an agent that is not selected', async () => {
    mockInvoke.mockResolvedValue(worktreeTree)

    renderFolder(makeDockState({ sessionId: 'other' }), { kind: 'session', id: 's1' })

    await waitFor(() => expect(screen.getByText('worktree.ts')).toBeInTheDocument())
    expect(mockInvoke).toHaveBeenCalledWith('files:tree', 's1')
  })

  // The whole point of the change: a repo you have not selected is not a
  // read-only listing, its files open in the editor like any other.
  it('opens a file from a folder that is not the selected session', async () => {
    mockInvoke.mockResolvedValue(checkoutTree)
    const onSelectFileFromFileTree = vi.fn()

    renderFolder(makeDockState({ sessionId: 's1', onSelectFileFromFileTree }), { kind: 'project', id: 'p1' })

    await waitFor(() => expect(screen.getByText('checkout.ts')).toBeInTheDocument())
    screen.getByText('checkout.ts').click()

    await waitFor(() => expect(onSelectFileFromFileTree).toHaveBeenCalledWith('/repos/alpha/checkout.ts'))
  })

  // The watcher follows exactly one folder — the selected agent's checkout — so
  // that folder's row is the one that can carry change badges. It is a folder
  // row like any other, named by its repo, so liveness is a question about the
  // folder's path, not about session ids.
  describe('change badges', () => {
    const workspaces = [
      { id: 'w1', name: 'alpha', projectIds: ['p1'] },
      { id: 'w2', name: 'oslo', projectIds: ['p1'], worktreePaths: { p1: '/worktrees/oslo' } },
    ] as unknown as DockAppState['workspaces']
    const projects = [
      { id: 'p1', name: 'alpha', path: '/repos/alpha' },
    ] as unknown as DockAppState['projects']

    function watchingAlpha(overrides: Partial<DockAppState> = {}): DockAppState {
      return makeDockState({
        sessionId: 's1',
        tree: checkoutTree,
        worktreeRootPath: '/repos/alpha',
        changes: [{ path: 'checkout.ts', type: 'modified' }],
        workspaces,
        projects,
        ...overrides,
      })
    }

    it('badges the folder the selected agent works in', () => {
      renderFolder(watchingAlpha(), { kind: 'project', id: 'p1', workspaceId: 'w1' })

      expect(screen.getByText('checkout.ts')).toBeInTheDocument()
      expect(screen.getByTitle('modified')).toHaveTextContent('M')
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('leaves another workspace’s checkout of the same repo unbadged', async () => {
      mockInvoke.mockResolvedValue(worktreeTree)

      renderFolder(watchingAlpha(), { kind: 'project', id: 'p1', workspaceId: 'w2' })

      await waitFor(() => expect(screen.getByText('worktree.ts')).toBeInTheDocument())
      expect(screen.queryByTitle('modified')).toBeNull()
    })

    // A row shows one folder. The agent's other folders reach it as add-dirs,
    // and stacking them here would repeat the workspace's other repos under
    // this repo's row.
    it('shows only its own folder, not the agent’s other ones', () => {
      const beta = dir('/repos/beta', 'beta', [file('/repos/beta/sibling.ts', 'sibling.ts')])

      renderFolder(
        watchingAlpha({
          additionalTrees: new Map([['/repos/beta', beta]]),
          rootLabels: new Map([['/repos/alpha', 'alpha'], ['/repos/beta', 'beta']]),
        }),
        { kind: 'project', id: 'p1', workspaceId: 'w1' },
      )

      expect(screen.getByText('checkout.ts')).toBeInTheDocument()
      expect(screen.queryByText('sibling.ts')).toBeNull()
    })

    // No session, no watched folder: every row is a plain listing, and an
    // undefined path must not read as "same folder as the agent's".
    it('does not treat an unregistered folder as the watched one', async () => {
      mockInvoke.mockResolvedValue(checkoutTree)

      renderFolder(
        makeDockState({ sessionId: null, tree: null, workspaces, projects }),
        { kind: 'project', id: 'ghost', workspaceId: 'w1' },
      )

      await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('files:tree-by-project', 'ghost', 'w1'))
    })
  })

  it('paints a reopened folder from cache instead of flashing empty', async () => {
    mockInvoke.mockResolvedValue(checkoutTree)
    const state = makeDockState({ sessionId: 's1' })

    const first = render(
      <DockStateContext.Provider value={state}>
        <FolderFilesTree source={{ kind: 'project', id: 'p1' }} />
      </DockStateContext.Provider>,
    )
    await waitFor(() => expect(screen.getByText('checkout.ts')).toBeInTheDocument())
    first.unmount()

    // Reopening renders the files synchronously — no waitFor, no empty frame.
    renderFolder(state, { kind: 'project', id: 'p1' })
    expect(screen.getByText('checkout.ts')).toBeInTheDocument()
  })
})
