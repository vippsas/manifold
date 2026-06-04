import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, findByDisplayValue, findByRole, fireEvent, waitFor } from '@testing-library/react'
import { PluginSettingsSection } from './PluginSettingsSection'

const MOCK_PLUGIN = {
  id: 'manifold.hello',
  manifest: {
    displayName: 'Hello',
    contributes: {
      configuration: {
        properties: {
          greeting: { type: 'string', default: 'Hello', description: 'x' },
          verbose: { type: 'boolean', default: false },
        },
      },
    },
  },
}

const MOCK_CONFIG = {
  properties: {
    greeting: { type: 'string', default: 'Hello', description: 'x' },
    verbose: { type: 'boolean', default: false },
  },
  values: {
    greeting: 'Hi',
    verbose: false,
  },
}

beforeEach(() => {
  const invoke = vi.fn(async (channel: string, ...args: unknown[]) => {
    if (channel === 'plugins:list') return [MOCK_PLUGIN]
    if (channel === 'plugins:get-config') return MOCK_CONFIG
    if (channel === 'plugins:set-config') return true
    return undefined
  })
  // @ts-expect-error test stub
  global.window.electronAPI = {
    invoke,
    on: vi.fn(() => () => {}),
  }
})

describe('PluginSettingsSection', () => {
  it('renders a text field for the greeting property with initial value "Hi"', async () => {
    const { container } = render(<PluginSettingsSection />)
    const input = await findByDisplayValue(container, 'Hi')
    expect(input).toBeTruthy()
    expect((input as HTMLInputElement).type).toBe('text')
  })

  it('renders a checkbox for the verbose boolean property', async () => {
    const { container } = render(<PluginSettingsSection />)
    // wait for data to load
    await findByDisplayValue(container, 'Hi')
    const checkboxes = container.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes.length).toBeGreaterThan(0)
  })

  it('calls invoke with plugins:set-config when the greeting text field changes', async () => {
    const { container } = render(<PluginSettingsSection />)
    const input = await findByDisplayValue(container, 'Hi') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Howdy' } })
    await waitFor(() => {
      expect(window.electronAPI.invoke).toHaveBeenCalledWith(
        'plugins:set-config',
        'manifold.hello',
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
})
