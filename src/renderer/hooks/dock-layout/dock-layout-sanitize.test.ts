import { describe, expect, it } from 'vitest'
import type { SerializedDockview } from 'dockview'
import { sanitizeDockLayout } from './dock-layout-helpers'

type Leaf = { type: 'leaf'; size: number; data: { views: string[]; activeView?: string } }
type Branch = { type: 'branch'; size: number; data: Array<Branch | Leaf> }

const asBranch = (layout: SerializedDockview): Branch => layout.grid.root as unknown as Branch
const asLeaf = (layout: SerializedDockview): Leaf => layout.grid.root as unknown as Leaf

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
              data: { id: 'sidebar', views: ['sidebar', 'memory'], activeView: 'memory' },
            },
            {
              type: 'leaf',
              size: 680,
              data: { id: 'workspace', views: ['agent', 'shell'], activeView: 'agent' },
            },
          ],
        },
      },
      panels: {
        sidebar: {},
        memory: {},
        agent: {},
        shell: {},
      },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved) as SerializedDockview
    const sidebar = asBranch(sanitized).data[0] as Leaf

    expect(sanitized).not.toBeNull()
    expect(Object.keys(sanitized.panels)).not.toContain('memory')
    expect(sidebar.data.views).toEqual(['sidebar'])
    expect(sidebar.data.activeView).toBe('sidebar')
  })

  // The whole point of retiring the old ids: a user upgrading from the
  // three-column model must land in a valid dock, not an empty or broken one.
  describe('migrating a layout saved under the old three-column model', () => {
    /** The real old shape: Repositories | agent | (Modified Files + editor). */
    const oldLayout = (): SerializedDockview => ({
      grid: {
        width: 1800,
        height: 1000,
        orientation: 'HORIZONTAL',
        root: {
          type: 'branch',
          size: 1800,
          data: [
            { type: 'leaf', size: 300, data: { id: 'repos', views: ['projects'], activeView: 'projects' } },
            { type: 'leaf', size: 1200, data: { id: 'workspace', views: ['agent'], activeView: 'agent' } },
            {
              type: 'leaf',
              size: 300,
              data: { id: 'files', views: ['modifiedFiles', 'editor'], activeView: 'modifiedFiles' },
            },
          ],
        },
      },
      panels: { projects: {}, agent: {}, modifiedFiles: {}, editor: {} },
    } as unknown as SerializedDockview)

    // Stripping the retired ids would leave `agent | editor` — a dock with no
    // sidebar at all, and no way for the user to get one back. Discarding the
    // layout hands the loader its fallback, which builds `sidebar | agent`.
    // dock-layout-old-layout-migration.test.tsx pins what actually renders.
    it('discards the layout so the default is built instead', () => {
      expect(sanitizeDockLayout(oldLayout())).toBeNull()
    })

    it('discards a two-column Repositories-and-agent layout too', () => {
      const saved = {
        grid: {
          root: {
            type: 'branch',
            size: 1000,
            data: [
              { type: 'leaf', size: 200, data: { id: 'repos', views: ['projects'], activeView: 'projects' } },
              { type: 'leaf', size: 800, data: { id: 'workspace', views: ['agent'], activeView: 'agent' } },
            ],
          },
        },
        panels: { projects: {}, agent: {} },
      } as unknown as SerializedDockview

      expect(sanitizeDockLayout(saved)).toBeNull()
    })

    // The discard is scoped to layouts that actually carry an old sidebar id:
    // a current layout whose sidebar the user closed must still restore as-is,
    // not silently spring the sidebar back on every restart.
    it('keeps a current layout that has no sidebar because the user closed it', () => {
      const saved = {
        grid: {
          root: {
            type: 'leaf',
            size: 1000,
            data: { id: 'workspace', views: ['agent', 'editor'], activeView: 'agent' },
          },
        },
        panels: { agent: {}, editor: {} },
      } as unknown as SerializedDockview

      expect(sanitizeDockLayout(saved)).toBe(saved)
    })

    // A half-migrated layout — the new sidebar plus a stale Modified Files tab
    // — keeps its sidebar and just drops the dead panel.
    it('heals a layout that already has the sidebar alongside a stale panel', () => {
      const saved = {
        grid: {
          root: {
            type: 'branch',
            size: 1000,
            data: [
              { type: 'leaf', size: 160, data: { id: 'side', views: ['sidebar'], activeView: 'sidebar' } },
              {
                type: 'leaf',
                size: 840,
                data: { id: 'workspace', views: ['agent', 'modifiedFiles'], activeView: 'modifiedFiles' },
              },
            ],
          },
        },
        panels: { sidebar: {}, agent: {}, modifiedFiles: {} },
      } as unknown as SerializedDockview

      const sanitized = sanitizeDockLayout(saved) as SerializedDockview

      expect(sanitized).not.toBeNull()
      expect(Object.keys(sanitized.panels).sort()).toEqual(['agent', 'sidebar'])
      const workspace = asBranch(sanitized).data[1] as Leaf
      expect(workspace.data.views).toEqual(['agent'])
      expect(workspace.data.activeView).toBe('agent')
    })
  })

  it('leaves a current sidebar-and-agent layout untouched', () => {
    const saved = {
      grid: {
        root: {
          type: 'branch',
          size: 1000,
          data: [
            { type: 'leaf', size: 160, data: { id: 'side', views: ['sidebar'], activeView: 'sidebar' } },
            { type: 'leaf', size: 840, data: { id: 'workspace', views: ['agent'], activeView: 'agent' } },
          ],
        },
      },
      panels: { sidebar: {}, agent: {} },
    } as unknown as SerializedDockview

    expect(sanitizeDockLayout(saved)).toBe(saved)
  })

  it('returns null when the saved layout only contains retired panels', () => {
    const saved = {
      grid: {
        root: {
          type: 'leaf',
          size: 1000,
          data: { id: 'memory-only', views: ['memory'], activeView: 'memory' },
        },
      },
      panels: { memory: {} },
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
            { type: 'leaf', size: 300, data: { id: 'empty-left', views: [], activeView: 'sidebar' } },
            {
              type: 'leaf',
              size: 700,
              data: { id: 'workspace', views: ['agent', 'shell', 'unsupportedPanel'], activeView: 'unsupportedPanel' },
            },
          ],
        },
      },
      panels: {
        sidebar: {},
        agent: {},
        shell: {},
        unsupportedPanel: {},
      },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved) as SerializedDockview
    const root = asLeaf(sanitized)

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
          data: { id: 'workspace', views: ['agent', 'loop'], activeView: 'loop' },
        },
      },
      panels: { agent: {}, loop: {} },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved) as SerializedDockview
    const leaf = asLeaf(sanitized)

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
          data: { id: 'workspace', views: ['agent', 'search'], activeView: 'search' },
        },
      },
      panels: { agent: {}, search: {} },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved) as SerializedDockview
    const leaf = asLeaf(sanitized)

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

    expect(sanitized).toBe(saved)
    expect(Object.keys(sanitized.panels)).toEqual(['agent', 'manifold.loop.panel', 'publisher.tree'])
  })

  it('returns null when every grid leaf is empty after sanitization', () => {
    const saved = {
      grid: {
        root: {
          type: 'branch',
          size: 1000,
          data: [
            { type: 'leaf', size: 500, data: { id: 'left', views: [], activeView: 'sidebar' } },
            { type: 'leaf', size: 500, data: { id: 'right', views: ['unsupportedPanel'], activeView: 'unsupportedPanel' } },
          ],
        },
      },
      panels: { unsupportedPanel: {} },
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
      panels: { agent: {}, 'agent:dead-1': {}, 'agent:live-1': {} },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved, new Set(['live-1'])) as SerializedDockview
    const leaf = asLeaf(sanitized)

    expect(Object.keys(sanitized.panels)).toEqual(['agent', 'agent:live-1'])
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

    expect(sanitizeDockLayout(saved)).toBe(saved)
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

  it('caps a stale restored sidebar width at the default one-sixth share', () => {
    const saved = {
      grid: {
        width: 1800,
        height: 1000,
        orientation: 'HORIZONTAL',
        root: {
          type: 'branch',
          size: 1800,
          data: [
            { type: 'leaf', size: 900, data: { id: 'side', views: ['sidebar'], activeView: 'sidebar' } },
            { type: 'leaf', size: 900, data: { id: 'agent', views: ['agent'], activeView: 'agent' } },
          ],
        },
      },
      panels: { sidebar: {}, agent: {} },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved) as SerializedDockview

    expect(sanitized).not.toBe(saved)
    expect(asBranch(sanitized).data.map((child) => child.size)).toEqual([300, 1500])
  })

  it('returns freed sidebar width to existing workspace panes proportionally', () => {
    const saved = {
      grid: {
        width: 1800,
        height: 1000,
        orientation: 'HORIZONTAL',
        root: {
          type: 'branch',
          size: 1800,
          data: [
            { type: 'leaf', size: 600, data: { id: 'side', views: ['sidebar'], activeView: 'sidebar' } },
            { type: 'leaf', size: 400, data: { id: 'agent', views: ['agent'], activeView: 'agent' } },
            { type: 'leaf', size: 800, data: { id: 'editor', views: ['editor'], activeView: 'editor' } },
          ],
        },
      },
      panels: { sidebar: {}, agent: {}, editor: {} },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved) as SerializedDockview
    const sizes = asBranch(sanitized).data.map((child) => child.size)

    expect(sizes[0]).toBe(300)
    expect(sizes[1] + sizes[2]).toBe(1500)
    // The freed 300px is split in proportion to the panes' existing widths.
    expect(sizes[1]).toBe(500)
    expect(sizes[2]).toBe(1000)
  })

  it('preserves a restored sidebar width that is not over the default cap', () => {
    const saved = {
      grid: {
        width: 1800,
        height: 1000,
        orientation: 'HORIZONTAL',
        root: {
          type: 'branch',
          size: 1800,
          data: [
            { type: 'leaf', size: 240, data: { id: 'side', views: ['sidebar'], activeView: 'sidebar' } },
            { type: 'leaf', size: 1560, data: { id: 'agent', views: ['agent'], activeView: 'agent' } },
          ],
        },
      },
      panels: { sidebar: {}, agent: {} },
    } as unknown as SerializedDockview

    expect(sanitizeDockLayout(saved)).toBe(saved)
  })
})
