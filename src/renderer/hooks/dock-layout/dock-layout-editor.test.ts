import { describe, expect, it, vi } from 'vitest'
import { ensureEditorPanelInWorkspace } from './dock-layout-editor'

describe('ensureEditorPanelInWorkspace', () => {
  it('adds the editor beside the agent panel when files is closed', () => {
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

  it('tabs the editor into the files group when the files panel is open', () => {
    // Files and the editor are intertwined: they share one tabbed group
    // rather than each claiming its own column.
    const agentPanel = { id: 'agent', group: { id: 'group-agent' } }
    const modifiedFilesPanel = { id: 'modifiedFiles', group: { id: 'group-files' } }
    const addPanel = vi.fn()
    const api = {
      getPanel: vi.fn((id: string) => {
        if (id === 'agent') return agentPanel
        if (id === 'modifiedFiles') return modifiedFilesPanel
        return undefined
      }),
      addPanel,
    }

    const changed = ensureEditorPanelInWorkspace(api as never)

    expect(changed).toBe(true)
    expect(addPanel).toHaveBeenCalledWith({
      id: 'editor',
      component: 'editor',
      title: 'Editor',
      inactive: true,
      position: { referencePanel: modifiedFilesPanel, direction: 'within' },
    })
  })

  it('leaves an existing editor tabbed with the agent in place', () => {
    // Regression: opening a file must not yank a user-placed editor back to
    // the default split. If the user tabbed the editor alongside the agent,
    // it should stay there across file opens.
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

    expect(changed).toBe(false)
    expect(moveTo).not.toHaveBeenCalled()
    expect(api.addPanel).not.toHaveBeenCalled()
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
