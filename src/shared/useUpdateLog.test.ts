import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockInvoke = vi.fn()
const mockUnsubscribe = vi.fn()
let updateLogListener: (() => void) | null = null
let updateCheckListener: (() => void) | null = null

const mockOn = vi.fn((channel: string, listener: () => void) => {
  if (channel === 'show-update-log') {
    updateLogListener = listener
  }
  if (channel === 'show-update-check') {
    updateCheckListener = listener
  }
  return mockUnsubscribe
})

beforeEach(() => {
  vi.clearAllMocks()
  updateLogListener = null
  updateCheckListener = null
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: mockOn,
  }
  mockInvoke.mockImplementation((channel: string, payload?: unknown) => {
    if (channel === 'app:version') return Promise.resolve('0.2.17')
    if (channel === 'settings:get') return Promise.resolve({ lastSeenReleaseNotesVersion: '0.2.17' })
    if (channel === 'release-notes:get') {
      return Promise.resolve({
        version: String(payload ?? '0.2.17'),
        name: 'Manifold v0.2.17',
        body: '# Notes',
        url: 'https://github.com/vippsas/manifold/releases/tag/v0.2.17',
        publishedAt: '2026-05-20T00:00:00.000Z',
        source: 'github',
      })
    }
    if (channel === 'updater:log') return Promise.resolve('2026-04-18T15:13:18.306Z [updater] check failed: 504')
    if (channel === 'updater:clear-log') return Promise.resolve(undefined)
    if (channel === 'updater:check') return Promise.resolve(undefined)
    if (channel === 'settings:update') return Promise.resolve(undefined)
    if (channel === 'release-notes:open-external') return Promise.resolve(undefined)
    throw new Error(`Unexpected invoke: ${channel}`)
  })
})

afterEach(() => {
  // Keep electronAPI mounted for React cleanup callbacks.
})

import { useUpdateLog } from './useUpdateLog'

describe('useUpdateLog', () => {
  it('opens release notes when the menu event fires', async () => {
    const { result } = renderHook(() => useUpdateLog())

    expect(mockOn).toHaveBeenCalledWith('show-update-log', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('show-update-check', expect.any(Function))

    act(() => {
      updateLogListener?.()
    })

    expect(result.current.visible).toBe(true)
    expect(result.current.activeTab).toBe('releaseNotes')

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.releaseNotes?.body).toContain('# Notes')
    })
  })

  it('opens diagnostics and starts a manual check from the menu event', async () => {
    const { result } = renderHook(() => useUpdateLog())

    act(() => {
      updateCheckListener?.()
    })

    expect(result.current.visible).toBe(true)
    expect(result.current.activeTab).toBe('diagnostics')

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('updater:check')
      expect(result.current.loading).toBe(false)
      expect(result.current.log).toContain('[updater] check failed: 504')
    })
  })

  it('auto-opens once for a newly installed version and marks it seen', async () => {
    mockInvoke.mockImplementation((channel: string, payload?: unknown) => {
      if (channel === 'app:version') return Promise.resolve('0.2.17')
      if (channel === 'settings:get') return Promise.resolve({ lastSeenReleaseNotesVersion: '0.2.16' })
      if (channel === 'settings:update') return Promise.resolve({ lastSeenReleaseNotesVersion: '0.2.17' })
      if (channel === 'release-notes:get') {
        return Promise.resolve({
          version: String(payload ?? '0.2.17'),
          name: 'Manifold v0.2.17',
          body: '# Notes',
          url: 'https://github.com/vippsas/manifold/releases/tag/v0.2.17',
          publishedAt: null,
          source: 'github',
        })
      }
      if (channel === 'updater:log' || channel === 'updater:clear-log' || channel === 'updater:check' || channel === 'release-notes:open-external') {
        return Promise.resolve(undefined)
      }
      throw new Error(`Unexpected invoke: ${channel}`)
    })

    const { result } = renderHook(() => useUpdateLog())

    await waitFor(() => {
      expect(result.current.visible).toBe(true)
      expect(result.current.activeTab).toBe('releaseNotes')
    })

    expect(mockInvoke).toHaveBeenCalledWith('settings:update', { lastSeenReleaseNotesVersion: '0.2.17' })
  })

  it('clears the diagnostics log through IPC and refreshes the content', async () => {
    mockInvoke
      .mockImplementationOnce((channel: string) => {
        if (channel === 'app:version') return Promise.resolve('0.2.17')
        throw new Error(`Unexpected invoke: ${channel}`)
      })
      .mockImplementationOnce((channel: string) => {
        if (channel === 'settings:get') return Promise.resolve({ lastSeenReleaseNotesVersion: '0.2.17' })
        throw new Error(`Unexpected invoke: ${channel}`)
      })
      .mockImplementation((channel: string, payload?: unknown) => {
        if (channel === 'release-notes:get') {
          return Promise.resolve({
            version: String(payload ?? '0.2.17'),
            name: 'Manifold v0.2.17',
            body: '# Notes',
            url: 'https://github.com/vippsas/manifold/releases/tag/v0.2.17',
            publishedAt: null,
            source: 'github',
          })
        }
        if (channel === 'updater:log') {
          return Promise.resolve(
            mockInvoke.mock.calls.filter(([name]) => name === 'updater:clear-log').length > 0
              ? 'No updater log entries have been recorded yet.'
              : '2026-04-18T15:13:18.306Z [updater] check failed: 504',
          )
        }
        if (channel === 'updater:clear-log' || channel === 'settings:update' || channel === 'updater:check' || channel === 'release-notes:open-external') {
          return Promise.resolve(undefined)
        }
        throw new Error(`Unexpected invoke: ${channel}`)
      })

    const { result } = renderHook(() => useUpdateLog())

    act(() => {
      result.current.openDiagnostics()
    })

    await waitFor(() => {
      expect(result.current.log).toContain('[updater] check failed: 504')
    })

    await act(async () => {
      await result.current.clear()
    })

    expect(mockInvoke).toHaveBeenCalledWith('updater:clear-log')
    expect(result.current.log).toBe('No updater log entries have been recorded yet.')
  })
})
