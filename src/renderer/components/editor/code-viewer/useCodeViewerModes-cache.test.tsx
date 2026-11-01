import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCodeViewerModes } from './useCodeViewerModes'
import { getEditorPaneModeControls } from '../editor-pane-mode-controls'
import type { FileOpenRequest } from '../file-open-request'

function propsFor(paneId: string, path: string) {
  return {
    paneId,
    activeFilePath: path,
    lastFileOpenRequest: { paneId, path, source: 'sourceControl' as const },
    isPreviewable: false,
    isImage: false,
    hasDiff: true,
    hasTabs: true,
    onOpenLinkedFile: vi.fn(),
  }
}

describe('useCodeViewerModes diff cache', () => {
  it('restores editor and diff choices after a remount, independently per pane', () => {
    const a = propsFor('pane-cache-remount', '/a.tf')
    const b = propsFor(a.paneId, '/b.tf')
    const { rerender, unmount } = renderHook((p) => useCodeViewerModes(p), { initialProps: a })
    act(() => { getEditorPaneModeControls(a.paneId)!.showEditor() })
    rerender(b)
    unmount()

    // Tab switches and remounts retain the last explicit request (B).
    const restoredA = { ...a, lastFileOpenRequest: b.lastFileOpenRequest }
    const restored = renderHook((p) => useCodeViewerModes(p), { initialProps: restoredA })
    expect(restored.result.current.diffMode).toBe(false)
    restored.rerender({ ...b, hasDiff: false })
    expect(restored.result.current.diffMode).toBe(false)
    restored.rerender(b)
    expect(restored.result.current.diffMode).toBe(true)

    const otherPane = renderHook(() => useCodeViewerModes(propsFor('pane-cache-other', a.activeFilePath)))
    expect(otherPane.result.current.diffMode).toBe(true)
    restored.rerender(restoredA)
    expect(restored.result.current.diffMode).toBe(false)
  })

  it('honors a new request while remounting without replaying it on later remounts', () => {
    const props = propsFor('pane-cache-new-request', '/code.ts')
    const first = renderHook(() => useCodeViewerModes(props))
    act(() => { getEditorPaneModeControls(props.paneId)!.showEditor() })
    first.unmount()

    const reopened = { ...props, lastFileOpenRequest: { ...props.lastFileOpenRequest } }
    const second = renderHook(() => useCodeViewerModes(reopened))
    expect(second.result.current.diffMode).toBe(true)
    act(() => { getEditorPaneModeControls(props.paneId)!.showEditor() })
    second.unmount()

    const restored = renderHook(() => useCodeViewerModes(reopened))
    expect(restored.result.current.diffMode).toBe(false)
  })

  it('bounds stored diff choices to 200 paths per pane', () => {
    const props = propsFor('pane-cache-diff-limit', '/0.tf')
    const editorRequest: FileOpenRequest = { paneId: props.paneId, path: '/0.tf', source: 'fileTree' }
    const file = (index: number) => ({ ...props, activeFilePath: `/${index}.tf`, lastFileOpenRequest: editorRequest })
    const { result, rerender } = renderHook((p) => useCodeViewerModes(p), { initialProps: file(0) })
    for (let index = 1; index < 200; index++) rerender(file(index))

    // Reverse insertion order so the oldest diff choice still has its first-open
    // record. Evicting that choice must not immediately seed it again.
    for (let index = 199; index >= 0; index--) {
      rerender(file(index))
      act(() => { getEditorPaneModeControls(props.paneId)!.showDiff() })
    }
    rerender(propsFor(props.paneId, '/200.tf'))
    expect(result.current.diffMode).toBe(true)
    rerender(file(199))
    expect(result.current.diffMode).toBe(false)
    rerender(file(198))
    expect(result.current.diffMode).toBe(true)
  })

  it('bounds first-open history so an evicted file can receive its default again', () => {
    const props = propsFor('pane-cache-default-limit', '/0.tf')
    const { result, rerender } = renderHook((p) => useCodeViewerModes(p), { initialProps: props })
    act(() => { getEditorPaneModeControls(props.paneId)!.showEditor() })
    for (let index = 1; index <= 200; index++) {
      rerender({ ...props, activeFilePath: `/${index}.tf` })
    }
    rerender(props)
    expect(result.current.diffMode).toBe(true)
  })
})
