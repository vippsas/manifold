import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCodeViewerModes } from './useCodeViewerModes'
import { getEditorPaneModeControls } from './editor-pane-mode-controls'

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
})
