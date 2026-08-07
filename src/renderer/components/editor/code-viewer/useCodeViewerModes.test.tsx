import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCodeViewerModes } from './useCodeViewerModes'
import { getEditorPaneModeControls } from '../editor-pane-mode-controls'

function baseProps(paneId: string, activeFilePath: string, isPreviewable: boolean) {
  return {
    paneId,
    activeFilePath,
    lastFileOpenRequest: { path: null, source: 'default' as const },
    isPreviewable,
    isImage: false,
    hasDiff: false,
    hasTabs: true,
    onOpenLinkedFile: vi.fn(),
  }
}

describe('useCodeViewerModes persistence', () => {
  it('auto-previews a markdown file on first open', () => {
    const { result } = renderHook((p) => useCodeViewerModes(p), {
      initialProps: baseProps('pane-a', '/notes.md', true),
    })
    expect(result.current.previewActive).toBe(true)
  })

  it('remembers a manual switch to editor across revisits', () => {
    const { result, rerender } = renderHook((p) => useCodeViewerModes(p), {
      initialProps: baseProps('pane-b', '/doc.md', true),
    })
    expect(result.current.previewActive).toBe(true)

    // user switches this markdown file to Editor mode
    act(() => { getEditorPaneModeControls('pane-b')!.showEditor() })
    rerender(baseProps('pane-b', '/doc.md', true))
    expect(result.current.previewActive).toBe(false)

    // open another (non-previewable) file, then come back to the markdown
    rerender(baseProps('pane-b', '/code.ts', false))
    rerender(baseProps('pane-b', '/doc.md', true))

    // it must STILL be Editor — the auto-preview does not re-fire
    expect(result.current.previewActive).toBe(false)
  })

  it('keeps editor mode when an edit makes diff data available', () => {
    const props = {
      ...baseProps('pane-c', '/code.ts', false),
      lastFileOpenRequest: {
        path: '/code.ts',
        source: 'default' as const,
      },
    }
    const { result, rerender } = renderHook((p) => useCodeViewerModes(p), {
      initialProps: props,
    })

    act(() => { result.current.keepEditorMode() })
    rerender({ ...props, hasDiff: true })

    expect(result.current.diffMode).toBe(false)
  })

  it('opens a Source Control click in diff mode, including diff data that arrives later', () => {
    const props = {
      ...baseProps('pane-d', '/code.ts', false),
      lastFileOpenRequest: {
        path: '/code.ts',
        source: 'sourceControl' as const,
      },
    }
    const { result, rerender } = renderHook((p) => useCodeViewerModes(p), {
      initialProps: { ...props, hasDiff: true },
    })
    expect(result.current.diffMode).toBe(true)

    // the diff can land after the open (async fetch); it must not be suppressed
    rerender({ ...props, hasDiff: false })
    rerender({ ...props, hasDiff: true })
    expect(result.current.diffMode).toBe(true)
  })

  it('opens a file tree click in the editor even when a diff exists', () => {
    const props = {
      ...baseProps('pane-e', '/code.ts', false),
      lastFileOpenRequest: {
        path: '/code.ts',
        source: 'fileTree' as const,
      },
    }
    const { result, rerender } = renderHook((p) => useCodeViewerModes(p), {
      initialProps: { ...props, hasDiff: true },
    })
    expect(result.current.diffMode).toBe(false)

    rerender({ ...props, hasDiff: true })
    expect(result.current.diffMode).toBe(false)
  })
})
