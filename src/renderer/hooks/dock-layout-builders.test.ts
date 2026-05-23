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
  it('omits the editor and search panels — they are added lazily when needed', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never, { showIdeasTab: true, showLoopTab: true, showVerdictsTab: false, showWatchTab: true })

    expect(addPanel).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'editor' }))
    expect(addPanel).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'search' }))
    expect(addPanel).toHaveBeenNthCalledWith(3, {
      id: 'backgroundAgent',
      component: 'backgroundAgent',
      title: 'Ideas',
      inactive: true,
      position: { referencePanel: 'agent', direction: 'within' },
    })
  })

  it('positions the file tree beside the agent panel', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never, { showIdeasTab: false, showLoopTab: false, showVerdictsTab: false, showWatchTab: false })

    expect(addPanel).toHaveBeenCalledWith({
      id: 'fileTree',
      component: 'fileTree',
      title: 'Files',
      position: { referencePanel: 'agent', direction: 'right' },
    })
    expect(addPanel).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'backgroundAgent' }),
    )
  })
})
