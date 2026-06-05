import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, findByDisplayValue, findByRole, fireEvent, waitFor, screen } from '@testing-library/react'
import { PluginSettingsSection } from './PluginSettingsSection'

const MOCK_PLUGIN_A = {
  id: 'pub.a',
  enabled: true,
  manifest: {
    displayName: 'A',
    contributes: {
      configuration: {
        properties: {
          greeting: { type: 'string', default: 'Hi' },
        },
      },
    },
  },
}

const MOCK_PLUGIN_B = {
  id: 'pub.b',
  enabled: false,
  manifest: {
    displayName: 'B',
  },
}

const MOCK_CONFIG_A = {
  properties: {
    greeting: { type: 'string', default: 'Hi' },
  },
  values: {
    greeting: 'Hi',
  },
}

beforeEach(() => {
  const invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
    if (channel === 'plugins:list') return [MOCK_PLUGIN_A, MOCK_PLUGIN_B]
    if (channel === 'plugins:get-config') return MOCK_CONFIG_A
    if (channel === 'plugins:set-config') return true
    if (channel === 'plugins:set-enabled') return true
    return undefined
  })
  // @ts-expect-error test stub
  global.window.electronAPI = {
    invoke,
    on: vi.fn(() => () => {}),
  }
})

describe('PluginSettingsSection', () => {
  it('renders both plugin A and plugin B with toggles', async () => {
    const { container } = render(<PluginSettingsSection />)
    // wait for async load — A has a text field
    await findByDisplayValue(container, 'Hi')
    const checkboxes = container.querySelectorAll('input[type="checkbox"]')
    // at least 2 checkboxes: one enable toggle for A and one for B
    // (A also has a boolean greeting if type were boolean, but greeting is string here)
    // So we expect: enableA + enableB = 2 at minimum
    expect(checkboxes.length).toBeGreaterThanOrEqual(2)
  })

  it('plugin B toggle is unchecked (disabled)', async () => {
    const { container } = render(<PluginSettingsSection />)
    await findByDisplayValue(container, 'Hi')
    const enableBCheckbox = container.querySelector('#pub\\.b-enabled') as HTMLInputElement
    expect(enableBCheckbox).toBeTruthy()
    expect(enableBCheckbox.checked).toBe(false)
  })

  it('plugin A toggle is checked (enabled)', async () => {
    const { container } = render(<PluginSettingsSection />)
    await findByDisplayValue(container, 'Hi')
    const enableACheckbox = container.querySelector('#pub\\.a-enabled') as HTMLInputElement
    expect(enableACheckbox).toBeTruthy()
    expect(enableACheckbox.checked).toBe(true)
  })

  it('toggling B calls invoke plugins:set-enabled with pub.b and true', async () => {
    const { container } = render(<PluginSettingsSection />)
    await findByDisplayValue(container, 'Hi')
    const enableBCheckbox = container.querySelector('#pub\\.b-enabled') as HTMLInputElement
    fireEvent.click(enableBCheckbox)
    await waitFor(() => {
      expect(window.electronAPI.invoke).toHaveBeenCalledWith(
        'plugins:set-enabled',
        'pub.b',
        true,
      )
    })
  })

  it('A (enabled + config) shows config field; B (no config) shows only toggle', async () => {
    const { container } = render(<PluginSettingsSection />)
    // A's config text field is present
    const greetingInput = await findByDisplayValue(container, 'Hi')
    expect(greetingInput).toBeTruthy()
    // B has no config fields — no additional inputs beyond the enable toggle
    const bSection = container.querySelector('#pub\\.b-enabled')?.closest('section')
    expect(bSection).toBeTruthy()
    const bInputs = bSection?.querySelectorAll('input') ?? []
    // Only the enable/disable toggle
    expect(bInputs.length).toBe(1)
  })

  it('shows "Disabled — hidden from + Apps" note for plugin B', async () => {
    render(<PluginSettingsSection />)
    await screen.findByText('A')
    expect(screen.getByText('Disabled — hidden from + Apps')).toBeTruthy()
  })

  it('calls invoke with plugins:set-config when a config field changes', async () => {
    const { container } = render(<PluginSettingsSection />)
    const input = await findByDisplayValue(container, 'Hi') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Howdy' } })
    await waitFor(() => {
      expect(window.electronAPI.invoke).toHaveBeenCalledWith(
        'plugins:set-config',
        'pub.a',
        'greeting',
        'Howdy',
      )
    })
  })

  it('shows the plugin section header', async () => {
    const { findByText } = render(<PluginSettingsSection />)
    const header = await findByText('Plugins')
    expect(header).toBeTruthy()
  })

  it('shows "No plugins installed" when list is empty', async () => {
    const invoke = vi.fn(async (channel: string) => {
      if (channel === 'plugins:list') return []
      return undefined
    })
    // @ts-expect-error test stub
    global.window.electronAPI = { invoke, on: vi.fn(() => () => {}) }
    render(<PluginSettingsSection />)
    await screen.findByText('No plugins installed')
  })

  it('reverts the enable toggle when plugins:set-enabled rejects (and does not leak an unhandled rejection)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unhandled: unknown[] = []
    const onUnhandled = (e: PromiseRejectionEvent): void => { unhandled.push(e.reason); e.preventDefault() }
    window.addEventListener('unhandledrejection', onUnhandled)
    try {
      const invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
        if (channel === 'plugins:list') return [MOCK_PLUGIN_A, MOCK_PLUGIN_B]
        if (channel === 'plugins:get-config') return MOCK_CONFIG_A
        if (channel === 'plugins:set-enabled') throw new Error('host crashed')
        return undefined
      })
      // @ts-expect-error test stub
      global.window.electronAPI = { invoke, on: vi.fn(() => () => {}) }

      const { container } = render(<PluginSettingsSection />)
      await findByDisplayValue(container, 'Hi')
      const enableBCheckbox = container.querySelector('#pub\\.b-enabled') as HTMLInputElement
      expect(enableBCheckbox.checked).toBe(false)

      // Optimistically flips to checked, then the rejecting IPC call must revert it.
      fireEvent.click(enableBCheckbox)

      await waitFor(() => {
        const cb = container.querySelector('#pub\\.b-enabled') as HTMLInputElement
        expect(cb.checked).toBe(false)
      })

      // Error was surfaced via the renderer's logging fallback, not swallowed.
      expect(consoleError).toHaveBeenCalled()
      // No unhandled promise rejection escaped.
      await Promise.resolve()
      expect(unhandled).toEqual([])
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled)
      consoleError.mockRestore()
    }
  })

  it('reverts a config field change when plugins:set-config rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unhandled: unknown[] = []
    const onUnhandled = (e: PromiseRejectionEvent): void => { unhandled.push(e.reason); e.preventDefault() }
    window.addEventListener('unhandledrejection', onUnhandled)
    try {
      const invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
        if (channel === 'plugins:list') return [MOCK_PLUGIN_A, MOCK_PLUGIN_B]
        if (channel === 'plugins:get-config') return MOCK_CONFIG_A
        if (channel === 'plugins:set-config') throw new Error('host crashed')
        return undefined
      })
      // @ts-expect-error test stub
      global.window.electronAPI = { invoke, on: vi.fn(() => () => {}) }

      const { container } = render(<PluginSettingsSection />)
      const input = await findByDisplayValue(container, 'Hi') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'Howdy' } })

      // After the rejecting set-config, the field reverts to the prior value.
      await waitFor(() => {
        const reverted = container.querySelector('#pub\\.a-greeting') as HTMLInputElement
        expect(reverted.value).toBe('Hi')
      })

      expect(consoleError).toHaveBeenCalled()
      await Promise.resolve()
      expect(unhandled).toEqual([])
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled)
      consoleError.mockRestore()
    }
  })
})
