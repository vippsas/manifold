import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModuleLauncher } from './ModuleLauncher'
import { DockStateContext } from './dock-panel-types'
import type { DockAppState } from './dock-panel-types'
import type { RegisteredPanel } from '../../../plugins/contribution-registry'

// The launcher is fed by the live contribution registry. Built-in modules now ship
// as plugins (Verdicts → manifold.statistics in #750), so drive it with synthetic
// contributions to cover both the internal and plugin-view rendering paths.
const mockContributions = vi.fn((): RegisteredPanel[] => [])
vi.mock('../../../plugins/use-contributions', () => ({
  useLauncherContributions: () => mockContributions(),
}))

const internalPanel: RegisteredPanel = { id: 'demo', title: 'Demo', description: 'A demo internal panel.', launcher: true, source: 'internal' }
const pluginPanel: RegisteredPanel = { id: 'manifold.statistics.panel', title: 'Statistics', description: 'Stats.', launcher: true, source: 'plugin', kind: 'webview' }

function renderWithState(overrides: Partial<DockAppState>) {
  const state = {
    sessionId: 's1',
    onOpenModule: vi.fn(),
    onOpenPluginView: vi.fn(),
    onOpenPluginTreeView: vi.fn(),
    isModuleOpen: () => false,
    ...overrides,
  } as unknown as DockAppState
  render(
    <DockStateContext.Provider value={state}>
      <ModuleLauncher />
    </DockStateContext.Provider>,
  )
  return state
}

describe('ModuleLauncher', () => {
  beforeEach(() => { mockContributions.mockReturnValue([internalPanel, pluginPanel]) })

  it('lists the contributed modules in the menu', () => {
    renderWithState({})
    fireEvent.click(screen.getByRole('button', { name: /open module/i }))
    for (const label of ['Demo', 'Statistics']) {
      expect(screen.getByRole('menuitem', { name: new RegExp(label) })).toBeInTheDocument()
    }
  })

  it('opens an internal module via onOpenModule', () => {
    const state = renderWithState({})
    fireEvent.click(screen.getByRole('button', { name: /open module/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Demo/ }))
    expect(state.onOpenModule).toHaveBeenCalledWith('demo')
  })

  it('opens a plugin view via onOpenPluginView', () => {
    const state = renderWithState({})
    fireEvent.click(screen.getByRole('button', { name: /open module/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Statistics/ }))
    expect(state.onOpenPluginView).toHaveBeenCalledWith('manifold.statistics.panel', 'Statistics')
  })

  it('marks open internal modules with a check', () => {
    renderWithState({ isModuleOpen: (id: string) => id === 'demo' })
    fireEvent.click(screen.getByRole('button', { name: /open module/i }))
    expect(screen.getByRole('menuitem', { name: /✓ Demo/ })).toBeInTheDocument()
  })

  it('renders nothing without dock state', () => {
    mockContributions.mockReturnValue([])
    const { container } = render(<ModuleLauncher />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the launcher when an agent is active', () => {
    renderWithState({ sessionId: 's1' })
    expect(screen.getByRole('button', { name: /open module/i })).toBeInTheDocument()
  })

  it('hides the launcher in the agentless state (no active session)', () => {
    renderWithState({ sessionId: null })
    expect(screen.queryByRole('button', { name: /open module/i })).toBeNull()
  })
})
