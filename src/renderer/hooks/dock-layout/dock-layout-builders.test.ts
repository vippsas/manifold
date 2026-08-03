import { describe, expect, it, vi } from 'vitest'
import { applyDefaultLayout } from './dock-layout-builders'

function createApi() {
  const addPanel = vi.fn((options: { id: string }) => ({
    id: options.id,
    api: {
      setActive: vi.fn(),
    },
  }))
  const fromJSON = vi.fn()
  const toJSON = vi.fn(() => ({
    grid: {
      root: {
        data: [{ size: 1 }, { size: 5 }],
      },
    },
  }))

  return {
    api: {
      addPanel,
      fromJSON,
      toJSON,
    },
    addPanel,
    fromJSON,
  }
}

describe('applyDefaultLayout', () => {
  it('splits the agent off the sidebar column, not the other way round', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never)

    expect(addPanel).toHaveBeenCalledWith({
      id: 'agent',
      component: 'agent',
      title: 'Agent',
      position: { referencePanel: expect.objectContaining({ id: 'sidebar' }), direction: 'right' },
    })
  })

  // The editor and the shell open on demand, so the default layout is two
  // columns — not a standing editor pane with nothing to show in it.
  it('adds only the sidebar and the agent', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never)

    expect(addPanel.mock.calls.map((call) => call[0].id)).toEqual(['sidebar', 'agent'])
  })
})
