import { describe, expect, it } from 'vitest'
import type { SerializedDockview } from 'dockview'
import { sanitizeDockLayout } from './dock-layout-helpers'

describe('sanitizeDockLayout', () => {
  it('removes the retired memory panel from saved layouts', () => {
    const saved = {
      grid: {
        root: {
          type: 'branch',
          size: 1000,
          data: [
            {
              type: 'leaf',
              size: 320,
              data: {
                id: 'sidebar',
                views: ['fileTree', 'modifiedFiles', 'memory'],
                activeView: 'memory',
              },
            },
            {
              type: 'leaf',
              size: 680,
              data: {
                id: 'workspace',
                views: ['agent', 'search'],
                activeView: 'agent',
              },
            },
          ],
        },
      },
      panels: {
        fileTree: {},
        modifiedFiles: {},
        memory: {},
        agent: {},
        search: {},
      },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved) as SerializedDockview
    const sidebar = (sanitized.grid.root as {
      type: 'branch'
      data: Array<{ type: 'leaf'; data: { views: string[]; activeView?: string } }>
    }).data[0]

    expect(sanitized).not.toBeNull()
    expect(Object.keys(sanitized.panels)).not.toContain('memory')
    expect(sidebar.data.views).toEqual(['fileTree', 'modifiedFiles'])
    expect(sidebar.data.activeView).toBe('fileTree')
  })

  it('returns null when the saved layout only contains retired panels', () => {
    const saved = {
      grid: {
        root: {
          type: 'leaf',
          size: 1000,
          data: {
            id: 'memory-only',
            views: ['memory'],
            activeView: 'memory',
          },
        },
      },
      panels: {
        memory: {},
      },
    } as unknown as SerializedDockview

    expect(sanitizeDockLayout(saved)).toBeNull()
  })
})
