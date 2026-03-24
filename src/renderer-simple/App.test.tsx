import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from './App'
import type { SimpleApp } from '../shared/simple-types'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())
const mockSend = vi.fn()
const mockRefreshApps = vi.fn()
const mockDeleteApp = vi.fn()
const mockUseApps = vi.fn()
const mockUseAgentStatus = vi.fn()
const mockUseChat = vi.fn()
const mockUsePreview = vi.fn()

vi.mock('./hooks/useApps', () => ({
  useApps: () => mockUseApps(),
}))

vi.mock('./hooks/useAgentStatus', () => ({
  useAgentStatus: () => mockUseAgentStatus(),
}))

vi.mock('./hooks/useChat', () => ({
  useChat: () => mockUseChat(),
}))

vi.mock('./hooks/usePreview', () => ({
  usePreview: () => mockUsePreview(),
}))

vi.mock('./components/Dashboard', () => ({
  Dashboard: ({ apps, onSelectApp }: { apps: SimpleApp[]; onSelectApp: (app: SimpleApp) => void }) => (
    <button onClick={() => onSelectApp(apps[0])}>Open app</button>
  ),
}))

vi.mock('./components/AppView', () => ({
  AppView: () => <div>App View</div>,
}))

vi.mock('../shared/themes/registry', () => ({
  loadTheme: () => ({
    type: 'dark',
    cssVars: {
      '--bg-primary': '#111111',
      '--bg-secondary': '#222222',
      '--text-primary': '#f5f5f5',
    },
  }),
  migrateLegacyTheme: (theme: string) => theme,
}))

vi.mock('../shared/themes/adapter', () => ({
  applyThemeCssVars: vi.fn(),
}))

vi.mock('../shared/useUpdateNotification', () => ({
  useUpdateNotification: () => ({
    updateReady: false,
    version: undefined,
    install: vi.fn(),
    dismiss: vi.fn(),
  }),
}))

vi.mock('../shared/UpdateToast', () => ({
  UpdateToast: () => null,
}))

function createApp(overrides: Partial<SimpleApp> = {}): SimpleApp {
  return {
    sessionId: 'session-1',
    projectId: 'project-1',
    runtimeId: 'codex',
    branchName: 'clock/fredrikstad',
    name: 'clock',
    description: 'Clock app',
    status: 'previewing',
    previewUrl: null,
    liveUrl: null,
    projectPath: '/Users/test/.manifold/projects/clock',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseApps.mockReturnValue({
    apps: [createApp()],
    loading: false,
    refreshApps: mockRefreshApps,
    deleteApp: mockDeleteApp,
  })
  mockUseAgentStatus.mockReturnValue({ status: 'waiting', durationMs: null })
  mockUseChat.mockReturnValue({ messages: [], sendMessage: vi.fn() })
  mockUsePreview.mockReturnValue({ previewUrl: null, liveUrl: null, setLiveUrl: vi.fn() })
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: mockOn,
    send: mockSend,
  }
  mockInvoke.mockImplementation((channel: string, ...args: unknown[]) => {
    if (channel === 'settings:get') {
      return Promise.resolve({ theme: 'manifold-dark', defaultRuntime: 'codex' })
    }
    if (channel === 'app:consume-pending-launch') {
      return Promise.resolve(null)
    }
    if (channel === 'simple:get-preview-url') {
      return Promise.resolve(null)
    }
    if (channel === 'agent:start-dev-server') {
      return Promise.resolve({ sessionId: 'dev-session-1' })
    }
    if (channel === 'simple:subscribe-chat') {
      return Promise.resolve(true)
    }
    if (channel === 'app:switch-mode') {
      return Promise.resolve(undefined)
    }
    throw new Error(`Unexpected invoke: ${channel}(${args.join(', ')})`)
  })
})

describe('App', () => {
  it('starts a dev server when reopening a waiting app without a preview URL', async () => {
    render(<App />)

    fireEvent.click(screen.getByText('Open app'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('simple:get-preview-url', 'session-1')
    })

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'agent:start-dev-server',
        'project-1',
        'clock/fredrikstad',
        'Clock app',
        'codex',
      )
    })

    expect(mockInvoke).toHaveBeenCalledWith('simple:subscribe-chat', 'dev-session-1')
    expect(mockRefreshApps).toHaveBeenCalled()
  })

  it('reopens the existing session when a preview URL already exists', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'settings:get') {
        return Promise.resolve({ theme: 'manifold-dark', defaultRuntime: 'codex' })
      }
      if (channel === 'app:consume-pending-launch') {
        return Promise.resolve(null)
      }
      if (channel === 'simple:get-preview-url') {
        return Promise.resolve('http://localhost:5174/')
      }
      if (channel === 'simple:subscribe-chat') {
        return Promise.resolve(true)
      }
      if (channel === 'app:switch-mode') {
        return Promise.resolve(undefined)
      }
      throw new Error(`Unexpected invoke: ${channel}`)
    })

    render(<App />)

    fireEvent.click(screen.getByText('Open app'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('simple:get-preview-url', 'session-1')
    })

    expect(mockInvoke).toHaveBeenCalledWith('simple:subscribe-chat', 'session-1')
    expect(mockInvoke).not.toHaveBeenCalledWith(
      'agent:start-dev-server',
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    )
  })
})
