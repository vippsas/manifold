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
                views: ['agent', 'shell'],
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
        shell: {},
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

  it('removes empty groups and unsupported panels from corrupted layouts', () => {
    const saved = {
      grid: {
        root: {
          type: 'branch',
          size: 1000,
          data: [
            {
              type: 'leaf',
              size: 300,
              data: {
                id: 'empty-left',
                views: [],
                activeView: 'projects',
              },
            },
            {
              type: 'leaf',
              size: 700,
              data: {
                id: 'workspace',
                views: ['agent', 'shell', 'unsupportedPanel'],
                activeView: 'unsupportedPanel',
              },
            },
          ],
        },
      },
      panels: {
        projects: {},
        agent: {},
        shell: {},
        unsupportedPanel: {},
      },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved) as SerializedDockview
    const root = sanitized.grid.root as {
      type: 'leaf'
      data: { views: string[]; activeView?: string }
    }

    expect(sanitized).not.toBeNull()
    expect(root.type).toBe('leaf')
    expect(root.data.views).toEqual(['agent', 'shell'])
    expect(root.data.activeView).toBe('agent')
    expect(Object.keys(sanitized.panels)).toEqual(['agent', 'shell'])
  })

  it('removes the retired loop tab from saved layouts', () => {
    const saved = {
      grid: {
        root: {
          type: 'leaf',
          size: 1000,
          data: {
            id: 'workspace',
            views: ['agent', 'loop'],
            activeView: 'loop',
          },
        },
      },
      panels: {
        agent: {},
        loop: {},
      },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved) as SerializedDockview
    const leaf = sanitized.grid.root as {
      type: 'leaf'
      data: { views: string[]; activeView?: string }
    }

    expect(sanitized).not.toBeNull()
    expect(Object.keys(sanitized.panels)).toEqual(['agent'])
    expect(leaf.data.views).toEqual(['agent'])
    expect(leaf.data.activeView).toBe('agent')
  })

  it('removes the retired builtin watch tab from saved layouts', () => {
    const saved = {
      grid: {
        root: {
          type: 'leaf',
          size: 1000,
          data: {
            id: 'workspace',
            views: ['agent', 'watch'],
            activeView: 'watch',
          },
        },
      },
      panels: {
        agent: {},
        watch: {},
      },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved) as SerializedDockview
    const leaf = sanitized.grid.root as {
      type: 'leaf'
      data: { views: string[]; activeView?: string }
    }

    expect(sanitized).not.toBeNull()
    expect(Object.keys(sanitized.panels)).toEqual(['agent'])
    expect(leaf.data.views).toEqual(['agent'])
    expect(leaf.data.activeView).toBe('agent')
  })

  it('removes the retired search tab from saved layouts', () => {
    const saved = {
      grid: {
        root: {
          type: 'leaf',
          size: 1000,
          data: {
            id: 'workspace',
            views: ['agent', 'search'],
            activeView: 'search',
          },
        },
      },
      panels: {
        agent: {},
        search: {},
      },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved) as SerializedDockview
    const leaf = sanitized.grid.root as {
      type: 'leaf'
      data: { views: string[]; activeView?: string }
    }

    expect(sanitized).not.toBeNull()
    expect(Object.keys(sanitized.panels)).toEqual(['agent'])
    expect(leaf.data.views).toEqual(['agent'])
    expect(leaf.data.activeView).toBe('agent')
  })

  it('keeps plugin webview and tree panels in saved layouts', () => {
    const saved = {
      grid: {
        root: {
          type: 'leaf',
          size: 1000,
          data: {
            id: 'workspace',
            views: ['agent', 'manifold.loop.panel', 'publisher.tree'],
            activeView: 'manifold.loop.panel',
          },
        },
      },
      panels: {
        agent: { id: 'agent', contentComponent: 'agent' },
        'manifold.loop.panel': { id: 'manifold.loop.panel', contentComponent: 'pluginView', title: 'Autoresearch Loop' },
        'publisher.tree': { id: 'publisher.tree', contentComponent: 'pluginTreeView', title: 'Plugin Tree' },
      },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved) as SerializedDockview
    const leaf = sanitized.grid.root as {
      type: 'leaf'
      data: { views: string[]; activeView?: string }
    }

    expect(sanitized).toBe(saved)
    expect(Object.keys(sanitized.panels)).toEqual(['agent', 'manifold.loop.panel', 'publisher.tree'])
    expect(leaf.data.views).toEqual(['agent', 'manifold.loop.panel', 'publisher.tree'])
    expect(leaf.data.activeView).toBe('manifold.loop.panel')
  })

  it('returns null when every grid leaf is empty after sanitization', () => {
    const saved = {
      grid: {
        root: {
          type: 'branch',
          size: 1000,
          data: [
            {
              type: 'leaf',
              size: 500,
              data: {
                id: 'left',
                views: [],
                activeView: 'projects',
              },
            },
            {
              type: 'leaf',
              size: 500,
              data: {
                id: 'right',
                views: ['unsupportedPanel'],
                activeView: 'unsupportedPanel',
              },
            },
          ],
        },
      },
      panels: {
        unsupportedPanel: {},
      },
    } as unknown as SerializedDockview

    expect(sanitizeDockLayout(saved)).toBeNull()
  })

  it('strips sibling agent panels whose backing session is not live', () => {
    const saved = {
      grid: {
        root: {
          type: 'leaf',
          size: 1000,
          data: {
            id: 'workspace',
            views: ['agent', 'agent:dead-1', 'agent:live-1'],
            activeView: 'agent:live-1',
          },
        },
      },
      panels: {
        agent: {},
        'agent:dead-1': {},
        'agent:live-1': {},
      },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved, new Set(['live-1'])) as SerializedDockview
    expect(Object.keys(sanitized.panels)).toEqual(['agent', 'agent:live-1'])
    const leaf = sanitized.grid.root as {
      type: 'leaf'
      data: { views: string[]; activeView?: string }
    }
    expect(leaf.data.views).toEqual(['agent', 'agent:live-1'])
    expect(leaf.data.activeView).toBe('agent:live-1')
  })

  it('keeps sibling panels when no live session set is provided (deferred filter)', () => {
    // When sessions haven't loaded yet the caller passes `undefined` so live
    // sibling tabs aren't wiped from the saved layout on first-load races.
    const saved = {
      grid: {
        root: {
          type: 'leaf',
          size: 1000,
          data: { id: 'workspace', views: ['agent', 'agent:s1'], activeView: 'agent:s1' },
        },
      },
      panels: { agent: {}, 'agent:s1': {} },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved)
    expect(sanitized).toBe(saved)
  })

  it('strips all sibling panels when an empty live session set is provided', () => {
    const saved = {
      grid: {
        root: {
          type: 'leaf',
          size: 1000,
          data: { id: 'workspace', views: ['agent', 'agent:s1'], activeView: 'agent:s1' },
        },
      },
      panels: { agent: {}, 'agent:s1': {} },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved, new Set<string>()) as SerializedDockview
    expect(Object.keys(sanitized.panels)).toEqual(['agent'])
  })

  it('normalizes stale default layouts with sidebars saved as thirds', () => {
    const saved = {
      grid: {
        orientation: 'HORIZONTAL',
        root: {
          type: 'branch',
          size: 1800,
          data: [
            {
              type: 'leaf',
              size: 600,
              data: { id: 'projects', views: ['projects'], activeView: 'projects' },
            },
            {
              type: 'leaf',
              size: 600,
              data: { id: 'agent', views: ['agent'], activeView: 'agent' },
            },
            {
              type: 'leaf',
              size: 600,
              data: { id: 'files', views: ['fileTree', 'modifiedFiles'], activeView: 'fileTree' },
            },
          ],
        },
      },
      panels: {
        projects: {},
        agent: {},
        fileTree: {},
        modifiedFiles: {},
      },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved) as SerializedDockview
    const root = sanitized.grid.root as {
      type: 'branch'
      data: Array<{ size: number; data: { views: string[] } }>
    }

    expect(sanitized).not.toBe(saved)
    expect(root.data.map((node) => node.size)).toEqual([300, 1200, 300])
    expect(root.data[2].data.views).toEqual(['fileTree', 'modifiedFiles'])
  })

  it('leaves moderately resized default sidebars untouched', () => {
    const saved = {
      grid: {
        orientation: 'HORIZONTAL',
        root: {
          type: 'branch',
          size: 1800,
          data: [
            {
              type: 'leaf',
              size: 400,
              data: { id: 'projects', views: ['projects'], activeView: 'projects' },
            },
            {
              type: 'leaf',
              size: 1000,
              data: { id: 'agent', views: ['agent'], activeView: 'agent' },
            },
            {
              type: 'leaf',
              size: 400,
              data: { id: 'files', views: ['fileTree', 'modifiedFiles'], activeView: 'fileTree' },
            },
          ],
        },
      },
      panels: {
        projects: {},
        agent: {},
        fileTree: {},
        modifiedFiles: {},
      },
    } as unknown as SerializedDockview

    expect(sanitizeDockLayout(saved)).toBe(saved)
  })
})
