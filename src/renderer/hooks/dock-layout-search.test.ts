import { describe, expect, it, vi } from 'vitest'
import { ensureSearchPanelInWorkspace } from './dock-layout-search'

describe('ensureSearchPanelInWorkspace', () => {
  it('adds search as a workspace tab beside the agent panel when absent', () => {
    const agentGroup = { id: 'group-agent' }
    const agentPanel = { id: 'agent', group: agentGroup }
    const addPanel = vi.fn()
    const api = {
      getPanel: vi.fn((id: string) => (id === 'agent' ? agentPanel : undefined)),
      addPanel,
    }

    const changed = ensureSearchPanelInWorkspace(api as never, [])

    expect(changed).toBe(true)
    expect(addPanel).toHaveBeenCalledWith({
      id: 'search',
      component: 'search',
      title: 'Search',
      inactive: true,
      position: { referencePanel: agentPanel, direction: 'within' },
    })
  })

  it('moves an existing sidebar search panel into the agent group', () => {
    const agentGroup = { id: 'group-agent' }
    const searchGroup = { id: 'group-sidebar' }
    const moveTo = vi.fn()
    const agentPanel = { id: 'agent', group: agentGroup }
    const searchPanel = { id: 'search', group: searchGroup, api: { moveTo } }
    const api = {
      getPanel: vi.fn((id: string) => {
        if (id === 'agent') return agentPanel
        if (id === 'search') return searchPanel
        return undefined
      }),
      addPanel: vi.fn(),
    }

    const changed = ensureSearchPanelInWorkspace(api as never, [])

    expect(changed).toBe(true)
    expect(moveTo).toHaveBeenCalledWith({
      group: agentGroup,
      position: 'center',
      skipSetActive: true,
    })
  })
})
