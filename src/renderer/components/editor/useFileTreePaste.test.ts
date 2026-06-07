import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type React from 'react'
import type { FileTreeNode } from '../../../shared/types'
import type { VisibleNode } from './file-tree-visible'
import type { FileTreeClipboard } from './useFileTreeClipboard'
import {
  collectClipboardImageFiles,
  resolveFileTreePasteTargetDir,
  useFileTreePaste,
} from './useFileTreePaste'

function file(name: string, path: string): FileTreeNode {
  return { name, path, isDirectory: false }
}

function dir(name: string, path: string): FileTreeNode {
  return { name, path, isDirectory: true, children: [] }
}

const visibleNodes: VisibleNode[] = [
  { node: dir('repo', '/repo'), depth: 0, parentPath: null },
  { node: dir('src', '/repo/src'), depth: 1, parentPath: '/repo' },
  { node: file('main.ts', '/repo/src/main.ts'), depth: 2, parentPath: '/repo/src' },
]

function clipboard(overrides: Partial<FileTreeClipboard> = {}): FileTreeClipboard {
  return {
    hasClipboard: false,
    copy: vi.fn(),
    cut: vi.fn(),
    paste: vi.fn(async () => undefined),
    ...overrides,
  }
}

function pasteEvent(file?: File): React.ClipboardEvent<HTMLDivElement> {
  const preventDefault = vi.fn()
  return {
    preventDefault,
    clipboardData: {
      items: file
        ? [{ kind: 'file', type: file.type, getAsFile: () => file }]
        : [],
      files: file ? [file] : [],
    },
  } as unknown as React.ClipboardEvent<HTMLDivElement>
}

describe('resolveFileTreePasteTargetDir', () => {
  it('uses a selected directory as the target', () => {
    expect(resolveFileTreePasteTargetDir({
      cursorPath: '/repo/src',
      visibleNodes,
      worktreeRootPath: '/repo',
    })).toBe('/repo/src')
  })

  it('uses the parent directory when a file is selected', () => {
    expect(resolveFileTreePasteTargetDir({
      cursorPath: '/repo/src/main.ts',
      visibleNodes,
      worktreeRootPath: '/repo',
    })).toBe('/repo/src')
  })

  it('falls back to the worktree root when nothing is selected', () => {
    expect(resolveFileTreePasteTargetDir({
      cursorPath: null,
      visibleNodes,
      worktreeRootPath: '/repo',
    })).toBe('/repo')
  })
})

describe('collectClipboardImageFiles', () => {
  it('keeps supported image files and ignores unsupported entries', () => {
    const png = new File(['png'], 'screenshot.png', { type: 'image/png' })
    const svg = new File(['svg'], 'icon.svg', { type: 'image/svg+xml' })
    const text = new File(['text'], 'note.txt', { type: 'text/plain' })

    const files = collectClipboardImageFiles(
      [
        { kind: 'file', type: png.type, getAsFile: () => png },
        { kind: 'file', type: svg.type, getAsFile: () => svg },
        { kind: 'file', type: text.type, getAsFile: () => text },
      ] as unknown as DataTransferItemList,
      [png] as unknown as FileList,
    )

    expect(files).toEqual([png])
  })
})

describe('useFileTreePaste', () => {
  it('pastes OS clipboard images into the selected directory before internal clipboard content', async () => {
    const clip = clipboard({ hasClipboard: true })
    const onPasteImage = vi.fn(async () => null)
    const image = new File(['png'], 'screenshot.png', { type: 'image/png' })
    const event = pasteEvent(image)

    const { result } = renderHook(() => useFileTreePaste({
      clipboard: clip,
      visibleNodes,
      cursorPath: '/repo/src',
      worktreeRootPath: '/repo',
      onPasteImage,
    }))

    act(() => result.current.handlePaste(event))

    await waitFor(() => {
      expect(onPasteImage).toHaveBeenCalledWith('/repo/src', expect.stringMatching(/^data:image\/png;base64,/))
    })
    expect(event.preventDefault).toHaveBeenCalled()
    expect(clip.paste).not.toHaveBeenCalled()
  })

  it('falls back to the internal file clipboard when no image is present', () => {
    const paste = vi.fn(async () => undefined)
    const clip = clipboard({ hasClipboard: true, paste })
    const event = pasteEvent()

    const { result } = renderHook(() => useFileTreePaste({
      clipboard: clip,
      visibleNodes,
      cursorPath: null,
      worktreeRootPath: '/repo',
    }))

    act(() => result.current.handlePaste(event))

    expect(event.preventDefault).toHaveBeenCalled()
    expect(paste).toHaveBeenCalledWith('/repo')
  })

  it('uses the system clipboard image path for keyboard paste', async () => {
    const paste = vi.fn(async () => undefined)
    const clip = clipboard({ hasClipboard: true, paste })
    const onPasteClipboardImage = vi.fn(async () => ({ pasted: true, error: null }))

    const { result } = renderHook(() => useFileTreePaste({
      clipboard: clip,
      visibleNodes,
      cursorPath: '/repo/src',
      worktreeRootPath: '/repo',
      onPasteClipboardImage,
    }))

    act(() => result.current.handleKeyboardPaste())

    await waitFor(() => {
      expect(onPasteClipboardImage).toHaveBeenCalledWith('/repo/src')
    })
    expect(paste).not.toHaveBeenCalled()
  })

  it('falls back to internal file clipboard on keyboard paste when the system clipboard has no image', async () => {
    const paste = vi.fn(async () => undefined)
    const clip = clipboard({ hasClipboard: true, paste })
    const onPasteClipboardImage = vi.fn(async () => ({ pasted: false, error: null }))

    const { result } = renderHook(() => useFileTreePaste({
      clipboard: clip,
      visibleNodes,
      cursorPath: null,
      worktreeRootPath: '/repo',
      onPasteClipboardImage,
    }))

    act(() => result.current.handleKeyboardPaste())

    await waitFor(() => {
      expect(paste).toHaveBeenCalledWith('/repo')
    })
    expect(onPasteClipboardImage).toHaveBeenCalledWith('/repo')
  })

  it('reports system clipboard paste errors instead of falling back', async () => {
    const paste = vi.fn(async () => undefined)
    const clip = clipboard({ hasClipboard: true, paste })
    const onPasteClipboardImage = vi.fn(async () => ({ pasted: false, error: 'No active session' }))

    const { result } = renderHook(() => useFileTreePaste({
      clipboard: clip,
      visibleNodes,
      cursorPath: null,
      worktreeRootPath: '/repo',
      onPasteClipboardImage,
    }))

    act(() => result.current.handleKeyboardPaste())

    await waitFor(() => {
      expect(result.current.pasteError).toBe('No active session')
    })
    expect(paste).not.toHaveBeenCalled()
  })
})
