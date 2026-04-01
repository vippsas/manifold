import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PreviewPane } from './PreviewPane'

function setEventUrl(event: Event, url: string): Event {
  Object.defineProperty(event, 'url', {
    configurable: true,
    value: url,
  })
  return event
}

describe('PreviewPane', () => {
  it('enables history navigation controls from webview navigation state', async () => {
    const { container } = render(<PreviewPane url="http://localhost:5173/" />)
    const webview = container.querySelector('webview') as HTMLElement & {
      canGoBack: () => boolean
      canGoForward: () => boolean
      goBack: () => void
      goForward: () => void
      getURL: () => string
    }

    let currentUrl = 'http://localhost:5173/'
    let canGoBack = false
    let canGoForward = false

    Object.assign(webview, {
      canGoBack: () => canGoBack,
      canGoForward: () => canGoForward,
      goBack: vi.fn(),
      goForward: vi.fn(),
      getURL: () => currentUrl,
      reload: vi.fn(),
      stop: vi.fn(),
    })

    fireEvent(webview, new Event('dom-ready'))

    const backButton = screen.getByRole('button', { name: 'Back' })
    const forwardButton = screen.getByRole('button', { name: 'Forward' })

    expect(backButton).toBeDisabled()
    expect(forwardButton).toBeDisabled()

    currentUrl = 'http://localhost:5173/settings'
    canGoBack = true
    fireEvent(webview, setEventUrl(new Event('did-navigate-in-page'), currentUrl))

    await waitFor(() => {
      expect(backButton).toBeEnabled()
    })
    expect(screen.getByTitle(currentUrl)).toBeInTheDocument()

    fireEvent.click(backButton)
    expect(webview.goBack).toHaveBeenCalledTimes(1)

    canGoForward = true
    fireEvent(webview, setEventUrl(new Event('did-stop-loading'), currentUrl))

    await waitFor(() => {
      expect(forwardButton).toBeEnabled()
    })

    fireEvent.click(forwardButton)
    expect(webview.goForward).toHaveBeenCalledTimes(1)
  })
})
