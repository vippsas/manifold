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

  it('positions the agent panel beside the projects sidebar', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never)

    expect(addPanel).toHaveBeenCalledWith({
      id: 'agent',
      component: 'agent',
      title: 'Agent',
      position: { referencePanel: expect.objectContaining({ id: 'projects' }), direction: 'right' },
    })
  })

  it('does not add a modified files panel — changes live in the Source Control view', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never)

    const addedIds = addPanel.mock.calls.map((call) => call[0].id)
    expect(addedIds).not.toContain('modifiedFiles')
  })

  it('adds only the core panels — launcher modules are opened on demand', () => {
    const { api, addPanel } = createApi()

    applyDefaultLayout(api as never)

    const addedIds = addPanel.mock.calls.map((call) => call[0].id)
    expect(addedIds).not.toContain('loop')
    expect(addedIds).not.toContain('verdicts')
    expect(addedIds).not.toContain('watch')
    expect(addedIds).toEqual(expect.arrayContaining(['projects', 'agent']))
  })
})
