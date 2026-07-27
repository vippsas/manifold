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
  it('omits the editor panel — it is added lazily when needed', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never)

    expect(addPanel).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'editor' }))
  })

  // Every tool panel shares one sidebar item, so files tabs into the
  // repositories group instead of claiming a column of its own.
  it('tabs the file tree into the repositories group', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never)

    expect(addPanel).toHaveBeenCalledWith({
      id: 'fileTree',
      component: 'fileTree',
      title: 'Files',
      position: { referencePanel: expect.objectContaining({ id: 'projects' }), direction: 'within' },
    })
  })

  it('splits the agent off the sidebar item, not the other way round', () => {
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
