import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCodeViewerModes } from './useCodeViewerModes'
import { getEditorPaneModeControls } from '../editor-pane-mode-controls'
import type { FileOpenSource } from '../file-open-request'

function baseProps(paneId: string, activeFilePath: string, isPreviewable: boolean) {
  return {
    paneId,
    activeFilePath,
    lastFileOpenRequest: { paneId, path: null, source: 'default' as const },
    isPreviewable,
    isImage: false,
    hasDiff: false,
    hasTabs: true,
    onOpenLinkedFile: vi.fn(),
  }
}

function changedFile(paneId: string, path: string, source: FileOpenSource = 'fileTree') {
  return {
    ...baseProps(paneId, path, false),
    lastFileOpenRequest: { paneId, path, source },
    hasDiff: true,
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
        paneId: 'pane-c',
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
        paneId: 'pane-d',
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
        paneId: 'pane-e',
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

  it.each(['fileTree', 'search', 'memory', 'markdownPreview'] as const)(
    'honors a new %s request for a file previously shown in diff mode',
    (source) => {
      const props = changedFile(`pane-reopen-${source}`, '/code.ts', 'sourceControl')
      const { result, rerender } = renderHook((p) => useCodeViewerModes(p), { initialProps: props })
      expect(result.current.diffMode).toBe(true)

      const request = { paneId: props.paneId, path: props.activeFilePath, source, line: 42 }
      rerender({ ...props, lastFileOpenRequest: request })
      expect(result.current.diffMode).toBe(false)
    },
  )

  it.each(['sourceControl', 'default'] as const)(
    'honors a new %s request after an explicit editor choice',
    (source) => {
      const props = changedFile(`pane-reopen-${source}`, '/code.ts', source)
      const { result, rerender } = renderHook((p) => useCodeViewerModes(p), { initialProps: props })
      act(() => { getEditorPaneModeControls(props.paneId)!.showEditor() })
      expect(result.current.diffMode).toBe(false)

      // The request can arrive before the selected file changes, while its diff is loading.
      const request = { paneId: props.paneId, path: props.activeFilePath, source }
      rerender({
        ...props,
        activeFilePath: '/other.ts',
        hasDiff: false,
        lastFileOpenRequest: request,
      })
      rerender({ ...props, hasDiff: false, lastFileOpenRequest: request })
      rerender({ ...props, lastFileOpenRequest: request })
      expect(result.current.diffMode).toBe(true)

      act(() => { getEditorPaneModeControls(props.paneId)!.showEditor() })
      rerender({ ...props, activeFilePath: '/other.ts', lastFileOpenRequest: request })
      rerender({ ...props, lastFileOpenRequest: request })
      expect(result.current.diffMode).toBe(false)
    },
  )

  it('keeps two changed file-tree selections in the editor across tab switches', () => {
    const a = changedFile('pane-tabs', '/a.tf')
    const b = changedFile('pane-tabs', '/b.tf')
    const { result, rerender } = renderHook((p) => useCodeViewerModes(p), { initialProps: a })
    expect(result.current.diffMode).toBe(false)
    rerender(b)
    expect(result.current.diffMode).toBe(false)

    // Tab clicks change only the active path; the last open request stays on B.
    for (const activeFilePath of ['/a.tf', '/b.tf', '/a.tf']) {
      rerender({ ...b, activeFilePath })
      expect(result.current.diffMode).toBe(false)
    }
  })

  it('restores each tab\'s own diff or editor mode', () => {
    const a = changedFile('pane-diff-tabs', '/a.tf')
    const b = changedFile('pane-diff-tabs', '/b.tf')
    const { result, rerender } = renderHook((p) => useCodeViewerModes(p), { initialProps: a })
    act(() => { getEditorPaneModeControls(a.paneId)!.showDiff() })
    expect(result.current.diffMode).toBe(true)

    rerender(b)
    expect(result.current.diffMode).toBe(false)
    rerender({ ...b, activeFilePath: a.activeFilePath })
    expect(result.current.diffMode).toBe(true)
    rerender(b)
    expect(result.current.diffMode).toBe(false)
  })

  it.each(['/a.tf', '/c.tf'])(
    'ignores another pane\'s Source Control request while on %s and on later tab clicks',
    (otherPath) => {
      const p1 = changedFile(`pane-target-${otherPath}`, '/a.tf')
      const p2 = changedFile(`pane-other-${otherPath}`, '/a.tf')
      const first = renderHook((p) => useCodeViewerModes(p), { initialProps: p1 })
      const second = renderHook((p) => useCodeViewerModes(p), { initialProps: p2 })
      act(() => { getEditorPaneModeControls(p2.paneId)!.showEditor() })
      second.rerender({ ...p2, activeFilePath: otherPath })

      const request = { paneId: p1.paneId, path: '/a.tf', source: 'sourceControl' as const }
      first.rerender({ ...p1, lastFileOpenRequest: request })
      second.rerender({ ...p2, activeFilePath: otherPath, lastFileOpenRequest: request })
      expect(first.result.current.diffMode).toBe(true)
      expect(second.result.current.diffMode).toBe(false)

      // A tab click changes only the path, retaining the request targeted at p1.
      second.rerender({ ...p2, lastFileOpenRequest: request })
      expect(second.result.current.diffMode).toBe(false)
    },
  )

  it.each(['showEditor', 'keepEditorMode'] as const)(
    '%s suppresses delayed diffs only for the active file across tab switches',
    (action) => {
      const a = changedFile(`pane-${action}`, '/a.tf', 'sourceControl')
      const b = changedFile(a.paneId, '/b.tf', 'sourceControl')
      const { result, rerender } = renderHook((p) => useCodeViewerModes(p), { initialProps: b })
      expect(result.current.diffMode).toBe(true)

      rerender({ ...a, hasDiff: false })
      act(() => {
        if (action === 'showEditor') getEditorPaneModeControls(a.paneId)!.showEditor()
        else result.current.keepEditorMode()
      })
      rerender(b)
      expect(result.current.diffMode).toBe(true)
      rerender({ ...b, activeFilePath: a.activeFilePath, hasDiff: false })
      rerender({ ...b, activeFilePath: a.activeFilePath, hasDiff: true })
      expect(result.current.diffMode).toBe(false)
    },
  )

  it.each(['sourceControl', 'default'] as const)(
    'defaults a first %s open to diff even when data arrives after a tab switch',
    (source) => {
      const a = changedFile(`pane-late-${source}`, '/a.tf', source)
      const b = changedFile(a.paneId, '/b.tf')
      const { result, rerender } = renderHook((p) => useCodeViewerModes(p), {
        initialProps: { ...a, hasDiff: false },
      })
      expect(result.current.diffMode).toBe(false)
      rerender(b)
      expect(result.current.diffMode).toBe(false)
      rerender({ ...b, activeFilePath: a.activeFilePath, hasDiff: false })
      expect(result.current.diffMode).toBe(false)
      rerender({ ...b, activeFilePath: a.activeFilePath })
      expect(result.current.diffMode).toBe(true)

      act(() => { getEditorPaneModeControls(a.paneId)!.showEditor() })
      rerender(b)
      rerender({ ...b, activeFilePath: a.activeFilePath })
      expect(result.current.diffMode).toBe(false)
    },
  )

  it('uses the active file\'s diff availability without losing its preference', () => {
    const a = changedFile('pane-diff-availability', '/a.tf', 'sourceControl')
    const b = changedFile(a.paneId, '/b.tf')
    const { result, rerender } = renderHook((p) => useCodeViewerModes(p), { initialProps: a })
    expect(result.current.diffMode).toBe(true)
    rerender(b)
    rerender({ ...b, activeFilePath: a.activeFilePath, hasDiff: false })
    expect(result.current.diffMode).toBe(false)
    rerender({ ...b, activeFilePath: a.activeFilePath })
    expect(result.current.diffMode).toBe(true)
  })

  it('preserves markdown auto-preview and each tab\'s preview/diff choice', () => {
    const a = { ...changedFile('pane-preview-diff', '/a.md', 'sourceControl'), isPreviewable: true }
    const b = { ...a, activeFilePath: '/b.md' }
    const { result, rerender } = renderHook((p) => useCodeViewerModes(p), { initialProps: a })
    expect(getEditorPaneModeControls(a.paneId)!.mode).toBe('preview')
    act(() => { getEditorPaneModeControls(a.paneId)!.showDiff() })
    expect(getEditorPaneModeControls(a.paneId)!.mode).toBe('diff')

    rerender(b)
    expect(result.current.previewActive).toBe(true)
    expect(result.current.diffMode).toBe(false)
    rerender(a)
    expect(getEditorPaneModeControls(a.paneId)!.mode).toBe('diff')
    act(() => { getEditorPaneModeControls(a.paneId)!.showPreview() })
    expect(result.current.diffMode).toBe(false)
    rerender(b)
    rerender(a)
    expect(getEditorPaneModeControls(a.paneId)!.mode).toBe('preview')
    expect(result.current.diffMode).toBe(false)
  })
})
