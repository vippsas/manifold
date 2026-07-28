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
  // The code viewer is a standing tab of the item rather than one that appears
  // on the first file open, so the item always offers the same three tabs.
  it('tabs the code viewer into the files item, inactive', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never)

    expect(addPanel).toHaveBeenCalledWith({
      id: 'editor',
      component: 'editor',
      title: 'Editor',
      position: { referencePanel: expect.objectContaining({ id: 'fileTree' }), direction: 'within' },
      inactive: true,
    })
  })

  // The files item is its own card on the far side of the agent — Repositories
  // is never one of its tabs.
  it('gives the files item its own column right of the agent', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never)

    expect(addPanel).toHaveBeenCalledWith({
      id: 'fileTree',
      component: 'fileTree',
      title: 'Files',
      position: { referencePanel: expect.objectContaining({ id: 'agent' }), direction: 'right' },
    })
  })

  it('tabs modified files into the files item', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never)

    expect(addPanel).toHaveBeenCalledWith({
      id: 'modifiedFiles',
      component: 'modifiedFiles',
      title: 'Modified Files',
      position: { referencePanel: expect.objectContaining({ id: 'fileTree' }), direction: 'within' },
    })
  })

  it('splits the agent off the repositories column, not the other way round', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never)

    expect(addPanel).toHaveBeenCalledWith({
      id: 'agent',
      component: 'agent',
      title: 'Agent',
      position: { referencePanel: expect.objectContaining({ id: 'projects' }), direction: 'right' },
    })
  })

  it('adds only the core panels — launcher modules are opened on demand', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never)

    const addedIds = addPanel.mock.calls.map((call) => call[0].id)
    expect(addedIds).not.toContain('loop')
    expect(addedIds).not.toContain('verdicts')
    expect(addedIds).not.toContain('watch')
    expect(addedIds).toEqual(expect.arrayContaining(['projects', 'agent', 'fileTree', 'modifiedFiles']))
  })
})
