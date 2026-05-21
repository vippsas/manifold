import { describe, expect, it, vi } from 'vitest'
import { ensureEditorPanelInWorkspace } from './dock-layout-editor'

describe('ensureEditorPanelInWorkspace', () => {
  it('adds the editor beside the agent panel when absent', () => {
    const agentGroup = { id: 'group-agent' }
    const agentPanel = { id: 'agent', group: agentGroup }
    const addPanel = vi.fn()
    const api = {
      getPanel: vi.fn((id: string) => (id === 'agent' ? agentPanel : undefined)),
      addPanel,
    }

    const changed = ensureEditorPanelInWorkspace(api as never)

    expect(changed).toBe(true)
    expect(addPanel).toHaveBeenCalledWith({
      id: 'editor',
      component: 'editor',
      title: 'Editor',
      inactive: true,
      position: { referencePanel: agentPanel, direction: 'right' },
    })
  })

  it('moves an existing editor panel out of the agent tab group', () => {
    const sharedGroup = { id: 'group-shared' }
    const moveTo = vi.fn()
    const agentPanel = { id: 'agent', group: sharedGroup }
    const editorPanel = { id: 'editor', group: sharedGroup, api: { moveTo } }
    const api = {
      getPanel: vi.fn((id: string) => {
        if (id === 'agent') return agentPanel
        if (id === 'editor') return editorPanel
        return undefined
      }),
      addPanel: vi.fn(),
    }

    const changed = ensureEditorPanelInWorkspace(api as never)

    expect(changed).toBe(true)
    expect(moveTo).toHaveBeenCalledWith({
      group: sharedGroup,
      position: 'right',
      skipSetActive: true,
    })
  })

  it('leaves the layout unchanged when editor is already split away from agent', () => {
    const agentPanel = { id: 'agent', group: { id: 'group-agent' } }
    const editorPanel = { id: 'editor', group: { id: 'group-editor' }, api: { moveTo: vi.fn() } }
    const api = {
      getPanel: vi.fn((id: string) => {
        if (id === 'agent') return agentPanel
        if (id === 'editor') return editorPanel
        return undefined
      }),
      addPanel: vi.fn(),
    }

    const changed = ensureEditorPanelInWorkspace(api as never)

    expect(changed).toBe(false)
    expect(editorPanel.api.moveTo).not.toHaveBeenCalled()
    expect(api.addPanel).not.toHaveBeenCalled()
  })
})
