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
        data: [{ size: 1 }, { size: 4 }, { size: 1 }],
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
  it('adds the default editor as a workspace tab beside the agent tabs', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never, { showIdeasTab: true })

    expect(addPanel).toHaveBeenNthCalledWith(3, {
      id: 'editor',
      component: 'editor',
      title: 'Editor',
      inactive: true,
      position: { referencePanel: 'agent', direction: 'within' },
    })
    expect(addPanel).toHaveBeenNthCalledWith(4, {
      id: 'search',
      component: 'search',
      title: 'Search',
      inactive: true,
      position: { referencePanel: 'agent', direction: 'within' },
    })
    expect(addPanel).toHaveBeenNthCalledWith(5, {
      id: 'backgroundAgent',
      component: 'backgroundAgent',
      title: 'Ideas',
      inactive: true,
      position: { referencePanel: 'agent', direction: 'within' },
    })
  })

  it('still omits Ideas when that setting is disabled', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never, { showIdeasTab: false })

    expect(addPanel).toHaveBeenCalledWith({
      id: 'editor',
      component: 'editor',
      title: 'Editor',
      inactive: true,
      position: { referencePanel: 'agent', direction: 'within' },
    })
    expect(addPanel).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'backgroundAgent' }),
    )
  })
})
