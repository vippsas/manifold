import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAppEffects } from './useAppEffects'
import type { UseDockLayoutResult } from './useDockLayout'

function createInput(webPreviewUrl: string | null) {
  const panels = new Set<string>()
  const addPanel = vi.fn(({ id }: { id: string }) => {
    panels.add(id)
    return { api: { setActive: vi.fn() } }
  })
  const getPanel = vi.fn((id: string) => {
    if (panels.has(id) || id === 'editor') return { api: { setActive: vi.fn() } }
    return undefined
  })
  const apiRef = { current: { addPanel, getPanel } } as UseDockLayoutResult['apiRef']
  const dockLayout: UseDockLayoutResult = {
    apiRef,
    onReady: vi.fn(),
    togglePanel: vi.fn(),
    closePanel: vi.fn(),
    focusPanel: vi.fn(),
    ensureEditorPanel: vi.fn(() => 'editor'),
    splitEditorPane: vi.fn(() => null),
    isPanelVisible: vi.fn(() => true),
    resetLayout: vi.fn(),
    hiddenPanels: [],
    editorPanelIds: ['editor'],
  }

  return {
    panels,
    addPanel,
    input: {
      dockLayout,
      webPreviewUrl,
      settings: { defaultRuntime: 'codex' },
      setActiveProject: vi.fn(),
      spawnAgent: vi.fn(),
      refreshOpenFiles: vi.fn(),
      refreshDiff: vi.fn(),
    },
  }
}

describe('useAppEffects', () => {
  beforeEach(() => {
    window.electronAPI = {
      invoke: vi.fn(),
      send: vi.fn(),
      on: vi.fn(() => () => {}),
    } as unknown as typeof window.electronAPI
  })

  it('does not recreate the preview panel after a manual close for the same URL', () => {
    const { panels, addPanel, input } = createInput('http://127.0.0.1:5173')

    const { rerender } = renderHook(
      ({ webPreviewUrl }) => useAppEffects({ ...input, webPreviewUrl }),
      { initialProps: { webPreviewUrl: input.webPreviewUrl } },
    )

    expect(addPanel).toHaveBeenCalledTimes(1)

    panels.delete('webPreview')
    rerender({ webPreviewUrl: 'http://127.0.0.1:5173' })

    expect(addPanel).toHaveBeenCalledTimes(1)
  })

  it('auto-opens the preview again after the preview URL is reset and detected again', () => {
    const { panels, addPanel, input } = createInput('http://127.0.0.1:5173')

    const { rerender } = renderHook(
      ({ webPreviewUrl }) => useAppEffects({ ...input, webPreviewUrl }),
      { initialProps: { webPreviewUrl: input.webPreviewUrl } },
    )

    expect(addPanel).toHaveBeenCalledTimes(1)

    panels.delete('webPreview')
    rerender({ webPreviewUrl: null })
    rerender({ webPreviewUrl: 'http://127.0.0.1:5173' })

    expect(addPanel).toHaveBeenCalledTimes(2)
  })
})
