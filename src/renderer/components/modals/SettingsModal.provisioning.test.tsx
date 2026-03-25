import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { SettingsModal } from './SettingsModal'
import { DEFAULT_SETTINGS } from '../../../shared/defaults'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockImplementation((channel: string, provisionerId?: string) => {
    if (channel === 'provisioning:get-statuses') {
      return Promise.resolve([
        {
          provisionerId: 'vercel-bundled',
          provisionerLabel: 'Vercel Templates',
          enabled: true,
          source: 'cache',
          state: 'healthy',
          templateCount: 1,
          summary: 'Using cached templates',
        },
      ])
    }
    if (channel === 'provisioning:check-health') {
      return Promise.resolve([
        {
          provisionerId: provisionerId ?? 'vercel-bundled',
          provisionerLabel: 'Vercel Templates',
          enabled: true,
          source: 'none',
          state: 'healthy',
          templateCount: 1,
          summary: 'Healthy',
        },
      ])
    }
    if (channel === 'provisioning:refresh-templates') {
      return Promise.resolve({ provisioners: [] })
    }
    return Promise.resolve(undefined)
  })

  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
    send: vi.fn(),
  }
})

function renderModal(overrides = {}) {
  const props = {
    visible: true,
    settings: { ...DEFAULT_SETTINGS },
    onSave: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  return { ...render(<SettingsModal {...props} />), props }
}

describe('SettingsModal provisioning tab', () => {
  it('allows editing provisioners from the provisioning tab', async () => {
    const { props } = renderModal()

    fireEvent.click(screen.getByRole('tab', { name: /Provisioning/i }))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('provisioning:get-statuses', expect.any(Array))
    })

    fireEvent.click(screen.getByText('Add External Provisioner'))
    fireEvent.change(screen.getByDisplayValue('External Provisioner 2'), { target: { value: 'Company Templates' } })
    fireEvent.change(screen.getByDisplayValue('external-cli-2'), { target: { value: 'company-backstage' } })
    fireEvent.change(screen.getByPlaceholderText('/usr/local/bin/manifold-company-provisioner'), {
      target: { value: '/usr/local/bin/company-provisioner' },
    })

    fireEvent.click(screen.getByText('Save'))

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        provisioning: {
          provisioners: expect.arrayContaining([
            expect.objectContaining({
              id: 'company-backstage',
              label: 'Company Templates',
              command: '/usr/local/bin/company-provisioner',
            }),
          ]),
        },
      }),
    )
  })

  it('runs provisioner health checks from the provisioning tab', async () => {
    renderModal()

    fireEvent.click(screen.getByRole('tab', { name: /Provisioning/i }))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('provisioning:get-statuses', expect.any(Array))
    })

    fireEvent.click(screen.getByText('Check All'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('provisioning:check-health', undefined, expect.any(Array))
    })
  })

  it('passes draft provisioner config to health checks before save', async () => {
    renderModal()

    fireEvent.click(screen.getByRole('tab', { name: /Provisioning/i }))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('provisioning:get-statuses', expect.any(Array))
    })

    fireEvent.click(screen.getByText('Add External Provisioner'))
    fireEvent.change(screen.getByPlaceholderText('/usr/local/bin/manifold-company-provisioner'), {
      target: { value: '/usr/local/bin/company-provisioner' },
    })

    fireEvent.click(screen.getAllByText('Check Health')[1])

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'provisioning:check-health',
        'external-cli-2',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'external-cli-2',
            command: '/usr/local/bin/company-provisioner',
          }),
        ]),
      )
    })
  })
})
