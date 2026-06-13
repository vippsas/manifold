import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LockToggleButton } from './LockToggleButton'
import { DockStateContext } from '../editor/editor-shell/dock-panel-types'
import type { DockAppState } from '../editor/editor-shell/dock-panel-types'

function renderWithContext(
  props: { sessionId: string; locked: boolean; name: string },
  overrides: Partial<DockAppState> = {},
) {
  const value = { onToggleLocked: vi.fn(), ...overrides } as unknown as DockAppState
  return {
    value,
    ...render(
      <DockStateContext.Provider value={value}>
        <LockToggleButton {...props} />
      </DockStateContext.Provider>,
    ),
  }
}

describe('LockToggleButton', () => {
  it('renders nothing without a DockState context', () => {
    const { container } = render(<LockToggleButton sessionId="s1" locked={false} name="oslo" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('labels the unlocked state as a lock action', () => {
    renderWithContext({ sessionId: 's1', locked: false, name: 'oslo' })
    const btn = screen.getByLabelText('Lock oslo to prevent deletion')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('labels the locked state as an unlock action', () => {
    renderWithContext({ sessionId: 's1', locked: true, name: 'oslo' })
    const btn = screen.getByLabelText('Unlock oslo')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('toggles locked and stops row activation on click', () => {
    const onToggleLocked = vi.fn()
    renderWithContext({ sessionId: 's1', locked: false, name: 'oslo' }, { onToggleLocked })
    const btn = screen.getByLabelText('Lock oslo to prevent deletion')
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true })
    const stop = vi.spyOn(clickEvent, 'stopPropagation')
    fireEvent(btn, clickEvent)
    expect(onToggleLocked).toHaveBeenCalledWith('s1', true)
    expect(stop).toHaveBeenCalled()
  })
})
