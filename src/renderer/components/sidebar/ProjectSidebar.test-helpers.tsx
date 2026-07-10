import { vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { ProjectSidebar } from './ProjectSidebar'

export const mockInvoke = vi.fn()

export function installLocalStorage(): void {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return store.size
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => store.delete(key)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
  }
  vi.stubGlobal('localStorage', storage)
}

export function installElectronApi(): void {
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  }
}

/** Renders the slim sidebar activity bar (Explorer + Source Control + Open Folder). */
export function renderProjectSidebar(overrides: Record<string, unknown> = {}) {
  const defaultProps = {
    onOpenFolder: vi.fn(),
    ...overrides,
  }
  return { ...render(<ProjectSidebar {...defaultProps} />), props: defaultProps }
}
