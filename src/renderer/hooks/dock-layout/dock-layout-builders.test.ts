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
  it('omits the editor panel — it is added lazily when needed', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never)

    expect(addPanel).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'editor' }))
  })

  it('positions the modified files panel beside the agent panel', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never)

    expect(addPanel).toHaveBeenCalledWith({
      id: 'modifiedFiles',
      component: 'modifiedFiles',
      title: 'Modified Files',
      position: { referencePanel: 'agent', direction: 'right' },
    })
  })

  it('adds only the core panels — launcher modules are opened on demand', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never)

    const addedIds = addPanel.mock.calls.map((call) => call[0].id)
    expect(addedIds).not.toContain('loop')
    expect(addedIds).not.toContain('verdicts')
    expect(addedIds).not.toContain('watch')
    expect(addedIds).toEqual(expect.arrayContaining(['projects', 'agent', 'modifiedFiles']))
  })
})
