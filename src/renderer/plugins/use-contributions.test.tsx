// src/renderer/plugins/use-contributions.test.tsx
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLoadPluginContributions } from './use-contributions'
import { getLauncherContributions, resetToInternal } from './contribution-registry'

beforeEach(() => {
  resetToInternal()
  // @ts-expect-error test stub
  global.window.electronAPI = {
    invoke: vi.fn(async (ch: string) =>
      ch === 'plugins:list-contributions'
        ? [{ id: 'p.v', title: 'Plug View', description: 'd', launcher: true, source: 'plugin', pluginId: 'p' }]
        : []),
    on: vi.fn(() => () => {}),
  }
})

describe('useLoadPluginContributions', () => {
  it('fetches plugin views and registers them as launcher contributions', async () => {
    renderHook(() => useLoadPluginContributions())
    await waitFor(() => {
      expect(getLauncherContributions().some((c) => c.id === 'p.v')).toBe(true)
    })
  })
})
