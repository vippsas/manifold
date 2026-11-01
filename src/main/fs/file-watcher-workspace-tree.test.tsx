import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import type { FileTreeNode } from '../../shared/types'
import { FileWatcher } from './file-watcher'
import { clearWorkspaceTreeCache, useWorkspaceTree } from '../../renderer/hooks/editor/useWorkspaceTree'

class FakeTreeWatcher {
  listener?: (id: string, root: string) => void
  watch(): void {}
  async unwatch(): Promise<void> {}
  async unwatchAll(): Promise<void> {}
  setOnTreeChanged(fn: (id: string, root: string) => void): void { this.listener = fn }
  change(root = '/repo/a'): void { this.listener?.('s1', root) }
}

class FakeIpc {
  listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  requests: { resolve: (tree: FileTreeNode) => void; reject: (error: Error) => void }[] = []
  invoke = vi.fn((_channel: string, ..._args: unknown[]) => new Promise<FileTreeNode>((resolve, reject) => {
    this.requests.push({ resolve, reject })
  }))
  send(): void {}
  getPathForFile(): string { return '' }
  on = (channel: string, listener: (...args: unknown[]) => void): (() => void) => {
    const listeners = this.listeners.get(channel) ?? new Set()
    this.listeners.set(channel, listeners)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  emit = (channel: string, payload: unknown): void => {
    // Deliver each IPC event separately, without relying on React's batching.
    act(() => {
      for (const listener of this.listeners.get(channel) ?? []) listener(payload)
    })
  }
}

const root: FileTreeNode = { name: 'a', path: '/repo/a', isDirectory: true, children: [] }

describe('useWorkspaceTree reload coalescing', () => {
  let ipc: FakeIpc
  let tree: FakeTreeWatcher
  let watcher: FileWatcher

  beforeEach(async () => {
    vi.useFakeTimers()
    clearWorkspaceTreeCache()
    ipc = new FakeIpc()
    window.electronAPI = ipc
    tree = new FakeTreeWatcher()
    watcher = new FileWatcher(async () => '', tree, async () => '', async () => 'main')
    watcher.setMainWindow({ isDestroyed: () => false, webContents: { send: ipc.emit } } as unknown as BrowserWindow)
    watcher.watch('/repo/a', 's1')
    watcher.watch('/repo/a', 's2')
    await vi.advanceTimersByTimeAsync(0)
  })

  afterEach(async () => {
    cleanup()
    await watcher.unwatchAll()
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  async function mount() {
    const hook = renderHook(({ id }) => useWorkspaceTree({ kind: 'project', id, workspaceId: 'w1' }), {
      initialProps: { id: 'p1' },
    })
    await act(async () => { ipc.requests[0].resolve(root) })
    ipc.invoke.mockClear()
    return hook
  }

  async function flushReload(): Promise<void> {
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  }

  it('turns one tree change fanned out to two primaries into one tree walk', async () => {
    await mount()
    tree.change()
    await flushReload()
    expect(ipc.invoke).toHaveBeenCalledExactlyOnceWith('files:tree-by-project', 'p1', 'w1')
    await act(async () => { ipc.requests[1].resolve(root) })
    await flushReload()
    expect(ipc.invoke).toHaveBeenCalledTimes(1)
  })

  it('runs exactly one trailing reload for changes arriving during a pending walk', async () => {
    const { result } = await mount()
    tree.change()
    await flushReload()
    tree.change()
    tree.change()
    await flushReload()
    expect(ipc.invoke).toHaveBeenCalledTimes(1)
    await act(async () => { ipc.requests[1].resolve(root) })
    await flushReload()
    expect(ipc.invoke).toHaveBeenCalledTimes(2)
    const latest = { ...root, children: [{ name: 'new.txt', path: '/repo/a/new.txt', isDirectory: false }] }
    await act(async () => { ipc.requests[2].resolve(latest) })
    await flushReload()
    expect(ipc.invoke).toHaveBeenCalledTimes(2)
    expect(result.current.tree).toEqual(latest)
  })

  it('keeps cached data after a failed walk and still runs a queued reload', async () => {
    const { result } = await mount()
    tree.change()
    await flushReload()
    tree.change()
    await act(async () => { ipc.requests[1].reject(new Error('checkout unavailable')) })
    await flushReload()
    expect(ipc.invoke).toHaveBeenCalledTimes(2)
    expect(result.current.tree).toEqual(root)
    await act(async () => { ipc.requests[2].resolve(root) })
  })

  it('ignores other roots and coalesces matching add-dir and focus refreshes', async () => {
    await mount()
    act(() => {
      tree.change('/repo/other')
      ipc.emit('files:changed', { source: '/repo/other' })
    })
    await flushReload()
    expect(ipc.invoke).not.toHaveBeenCalled()
    act(() => {
      ipc.emit('files:changed', { source: '/repo/a' })
      window.dispatchEvent(new Event('focus'))
    })
    await flushReload()
    expect(ipc.invoke).toHaveBeenCalledTimes(1)
  })

  it('discards old results and trailing reloads when the folder changes', async () => {
    const { result, rerender } = await mount()
    tree.change()
    await flushReload()
    tree.change()
    rerender({ id: 'p2' })
    const nextRoot = { ...root, path: '/repo/b', name: 'b' }
    await act(async () => {
      ipc.requests[2].resolve(nextRoot)
      ipc.requests[1].resolve(root)
    })
    await flushReload()
    expect(ipc.invoke).toHaveBeenCalledTimes(2)
    expect(result.current.tree).toEqual(nextRoot)
  })

  it('cancels scheduled and trailing reloads on unmount', async () => {
    const { unmount } = await mount()
    tree.change()
    await flushReload()
    tree.change()
    await act(async () => { ipc.requests[1].resolve(root) })
    unmount()
    await flushReload()
    expect(ipc.invoke).toHaveBeenCalledTimes(1)
  })
})
