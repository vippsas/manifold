import { vi } from 'vitest'

export const mockInvoke = vi.fn()
export const mockOn = vi.fn(() => vi.fn())

export const sampleProjects = [
  { id: 'p1', name: 'Project A', path: '/a', baseBranch: 'main', addedAt: '2024-01-01' },
  { id: 'p2', name: 'Project B', path: '/b', baseBranch: 'main', addedAt: '2024-01-02' },
]

export function installElectronApi(): void {
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: mockOn,
  }
}
