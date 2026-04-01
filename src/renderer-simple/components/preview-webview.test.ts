import { describe, expect, it, vi } from 'vitest'
import {
  getWebviewNavigationState,
  navigateWebviewHistory,
  reloadWebview,
  stopWebview,
} from './preview-webview'

describe('preview-webview', () => {
  it('reloads only connected and ready webviews', () => {
    const reload = vi.fn()

    expect(reloadWebview({ isConnected: true, reload }, true)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reloadWebview({ isConnected: false, reload }, true)).toBe(false)
    expect(reloadWebview({ isConnected: true, reload }, false)).toBe(false)
  })

  it('swallows reload failures from detached guests', () => {
    const reload = vi.fn(() => {
      throw new Error('guest detached')
    })

    expect(reloadWebview({ isConnected: true, reload }, true)).toBe(false)
  })

  it('stops connected webviews and ignores teardown failures', () => {
    const stop = vi.fn()
    stopWebview({ isConnected: true, stop })
    expect(stop).toHaveBeenCalledTimes(1)

    const explodingStop = vi.fn(() => {
      throw new Error('already gone')
    })
    expect(() => stopWebview({ isConnected: true, stop: explodingStop })).not.toThrow()
    expect(() => stopWebview({ isConnected: false, stop })).not.toThrow()
    expect(() => stopWebview(null)).not.toThrow()
  })

  it('reads navigation state from connected webviews', () => {
    expect(
      getWebviewNavigationState(
        {
          isConnected: true,
          canGoBack: () => true,
          canGoForward: () => false,
          getURL: () => 'http://localhost:5173/settings',
        },
        'http://localhost:5173/',
      ),
    ).toEqual({
      canGoBack: true,
      canGoForward: false,
      currentUrl: 'http://localhost:5173/settings',
    })

    expect(getWebviewNavigationState(null, 'http://localhost:5173/')).toEqual({
      canGoBack: false,
      canGoForward: false,
      currentUrl: 'http://localhost:5173/',
    })
  })

  it('navigates only when the requested history direction is available', () => {
    const goBack = vi.fn()
    const goForward = vi.fn()

    expect(
      navigateWebviewHistory(
        {
          isConnected: true,
          canGoBack: () => true,
          canGoForward: () => false,
          goBack,
          goForward,
        },
        'back',
      ),
    ).toBe(true)
    expect(goBack).toHaveBeenCalledTimes(1)

    expect(
      navigateWebviewHistory(
        {
          isConnected: true,
          canGoBack: () => false,
          canGoForward: () => false,
          goBack,
          goForward,
        },
        'forward',
      ),
    ).toBe(false)
    expect(goForward).not.toHaveBeenCalled()
  })
})
