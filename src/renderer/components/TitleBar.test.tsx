import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { TitleBar } from './TitleBar'

const wired = {
  themeType: 'dark' as const,
  onToggleTheme: vi.fn(),
  themeFamily: 'manifold',
  onSelectThemeFamily: vi.fn(),
}

describe('TitleBar', () => {
  it('shows "Manifold" when no project is active', () => {
    render(<TitleBar />)
    expect(screen.getByText('Manifold')).toBeInTheDocument()
  })

  it('shows no name when a project is active', () => {
    render(<TitleBar projectName="Alpha" />)
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()
    expect(screen.queryByText('Manifold')).not.toBeInTheDocument()
  })

  it('omits the theme controls when no handlers are wired', () => {
    render(<TitleBar projectName="Alpha" />)
    expect(screen.queryByLabelText('Theme')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('keeps search out of the title bar — it lives in the activity rail', () => {
    render(<TitleBar projectName="Alpha" {...wired} />)
    expect(screen.queryByLabelText('Search files, code and memory')).toBeNull()
  })

  describe('theme controls', () => {
    it('selects a theme family', () => {
      const onSelectThemeFamily = vi.fn()
      render(<TitleBar projectName="Alpha" {...wired} onSelectThemeFamily={onSelectThemeFamily} />)

      const select = screen.getByLabelText('Theme') as HTMLSelectElement
      expect(select.value).toBe('manifold')

      fireEvent.change(select, { target: { value: 'jade' } })
      expect(onSelectThemeFamily).toHaveBeenCalledWith('jade')
    })

    // The family list is derived from the theme registry rather than hardcoded. The
    // previous hardcoded list is exactly what went stale — it kept offering Royal
    // after that family was retired.
    it('lists the shipped families and nothing retired', () => {
      render(<TitleBar projectName="Alpha" {...wired} />)
      const options = [...screen.getByLabelText('Theme').querySelectorAll('option')].map((o) => o.textContent)

      expect(options).toContain('Manifold')
      expect(options).toContain('Jade')
      expect(options).not.toContain('Royal')
      // One entry per family, not one per dark/light theme.
      expect(new Set(options).size).toBe(options.length)
    })

    it('offers the opposite variant and toggles to it', () => {
      const onToggleTheme = vi.fn()
      const { rerender } = render(
        <TitleBar projectName="Alpha" {...wired} onToggleTheme={onToggleTheme} />,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Switch to Light theme' }))
      expect(onToggleTheme).toHaveBeenCalled()

      rerender(<TitleBar projectName="Alpha" {...wired} themeType="light" onToggleTheme={onToggleTheme} />)
      expect(screen.getByRole('button', { name: 'Switch to Dark theme' })).toBeInTheDocument()
    })
  })
})
