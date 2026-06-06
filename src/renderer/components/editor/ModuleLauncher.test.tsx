import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModuleLauncher } from './ModuleLauncher'
import { DockStateContext } from './dock-panel-types'
import type { DockAppState } from './dock-panel-types'

function renderWithState(overrides: Partial<DockAppState>) {
  const state = {
    onOpenModule: vi.fn(),
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
  it('lists all three modules in the menu', () => {
    renderWithState({})
    fireEvent.click(screen.getByRole('button', { name: /open module/i }))
    for (const label of ['Ideas', 'Verdicts', 'Watch']) {
      expect(screen.getByRole('menuitem', { name: new RegExp(label) })).toBeInTheDocument()
    }
  })

  it('opens a module on click', () => {
    const state = renderWithState({})
    fireEvent.click(screen.getByRole('button', { name: /open module/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Watch/ }))
    expect(state.onOpenModule).toHaveBeenCalledWith('watch')
  })

  it('marks open modules with a check', () => {
    renderWithState({ isModuleOpen: (id) => id === 'verdicts' })
    fireEvent.click(screen.getByRole('button', { name: /open module/i }))
    expect(screen.getByRole('menuitem', { name: /✓ Verdicts/ })).toBeInTheDocument()
  })

  it('renders nothing without dock state', () => {
    const { container } = render(<ModuleLauncher />)
    expect(container.firstChild).toBeNull()
  })
})
