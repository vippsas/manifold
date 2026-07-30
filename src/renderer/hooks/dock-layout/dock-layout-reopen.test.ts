import { describe, it, expect } from 'vitest'
import type { SerializedDockview } from 'dockview'
import { computeReopenPlacement } from './dock-layout-loader'

type Ori = 'HORIZONTAL' | 'VERTICAL'

const leaf = (views: string[], size = 100): unknown => ({
  type: 'leaf', size, data: { id: views.join('-'), views, activeView: views[0] },
})
const branch = (data: unknown[], size = 300): unknown => ({ type: 'branch', size, data })

function snap(root: unknown, orientation: Ori = 'HORIZONTAL'): SerializedDockview {
  return { grid: { root, width: 1000, height: 700, orientation }, panels: {} } as unknown as SerializedDockview
}

const alive = (...ids: string[]) => (id: string): boolean => ids.includes(id)

describe('computeReopenPlacement', () => {
  it('reopens a horizontally-split pane to the right of its surviving left neighbor', () => {
    const root = branch([leaf(['projects']), leaf(['agent']), leaf(['shell'], 250)])
    expect(computeReopenPlacement(snap(root, 'HORIZONTAL'), 'shell', alive('projects', 'agent')))
      .toEqual({ referencePanelId: 'agent', direction: 'right', size: { axis: 'width', px: 250 } })
  })

  it('reopens a vertically-split pane below its surviving upper neighbor', () => {
    const center = branch([leaf(['agent']), leaf(['shell'], 200)]) // nested branch → VERTICAL
    const root = branch([leaf(['projects']), center])
    expect(computeReopenPlacement(snap(root, 'HORIZONTAL'), 'shell', alive('projects', 'agent')))
      .toEqual({ referencePanelId: 'agent', direction: 'below', size: { axis: 'height', px: 200 } })
  })

  it('rejoins its original tab group when a co-tenant survives', () => {
    const root = branch([leaf(['projects']), leaf(['agent', 'editor'])])
    expect(computeReopenPlacement(snap(root), 'editor', alive('projects', 'agent')))
      .toEqual({ referencePanelId: 'agent', direction: 'within' })
  })

  it('uses the surviving right neighbor when the left neighbor is also gone', () => {
    const root = branch([leaf(['projects']), leaf(['shell'], 250), leaf(['agent'])])
    expect(computeReopenPlacement(snap(root, 'HORIZONTAL'), 'shell', alive('agent')))
      .toEqual({ referencePanelId: 'agent', direction: 'left', size: { axis: 'width', px: 250 } })
  })

  it('returns undefined when no neighbor survives (caller falls back to hints)', () => {
    const root = branch([leaf(['shell'])])
    expect(computeReopenPlacement(snap(root), 'shell', alive())).toBeUndefined()
  })

  // Repositories and the files item are separate cards: a snapshot taken back
  // when they shared a group must not tab them together again.
  it('reopens Repositories beside the files item, never as one of its tabs', () => {
    const root = branch([leaf(['agent']), leaf(['projects', 'modifiedFiles', 'editor'], 250)])
    expect(computeReopenPlacement(snap(root, 'HORIZONTAL'), 'projects', alive('agent', 'modifiedFiles', 'editor')))
      .toEqual({ referencePanelId: 'agent', direction: 'right', size: { axis: 'width', px: 250 } })
  })

  it('reopens a files panel beside Repositories, never as one of its tabs', () => {
    const root = branch([leaf(['projects', 'modifiedFiles'], 250), leaf(['agent'])])
    expect(computeReopenPlacement(snap(root, 'HORIZONTAL'), 'modifiedFiles', alive('projects', 'agent')))
      .toEqual({ referencePanelId: 'agent', direction: 'left', size: { axis: 'width', px: 250 } })
  })

  it('still rejoins the files item when a files sibling survives', () => {
    const root = branch([leaf(['agent']), leaf(['projects', 'modifiedFiles', 'editor'], 250)])
    expect(computeReopenPlacement(snap(root), 'editor', alive('agent', 'projects', 'modifiedFiles')))
      .toEqual({ referencePanelId: 'modifiedFiles', direction: 'within' })
  })
})
