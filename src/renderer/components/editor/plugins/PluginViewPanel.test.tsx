import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { PluginViewPanel } from './PluginViewPanel'
import { DockStateContext, type DockAppState } from '../dock-panel-types'

describe('PluginViewPanel', () => {
  beforeEach(() => {
    // @ts-expect-error test stub
    global.window.electronAPI = {
      invoke: vi.fn(async () => undefined),
      on: vi.fn(() => () => {}),
    }
  })

  it('sandboxes the webview with allow-same-origin so nested embeds keep real origins', () => {
    // Sandbox flags propagate to nested browsing contexts: without
    // allow-same-origin the YouTube iframe admitted by a view's frameSources
    // runs from an opaque origin and its player black-screens (no storage
    // access). Script isolation rests on the nonce CSP, not on this flag.
    const { container } = render(
      <DockStateContext.Provider value={{ theme: 'dark' } as unknown as DockAppState}>
        <PluginViewPanel api={{ id: 'manifold.watch.panel' }} />
      </DockStateContext.Provider>,
    )
    const iframe = container.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
  })
})
