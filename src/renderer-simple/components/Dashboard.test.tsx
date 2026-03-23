import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Dashboard } from './Dashboard'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'provisioning:list-templates' || channel === 'provisioning:refresh-templates') {
      return Promise.resolve([
        {
          id: 'web-react-vite',
          qualifiedId: 'oss-bundled:web-react-vite',
          title: 'Web App',
          description: 'Starter app.',
          category: 'Web',
          tags: ['react'],
          provisionerId: 'oss-bundled',
          provisionerLabel: 'Open Source Templates',
          paramsSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', title: 'App name', placeholder: 'e.g. customer-feedback' },
              description: { type: 'string', title: 'Describe what you want to build', multiline: true },
            },
            required: ['name', 'description'],
          },
        },
      ])
    }
    return Promise.resolve(undefined)
  })

  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: mockOn,
    send: vi.fn(),
  }
})

function renderDashboard(overrides: Partial<React.ComponentProps<typeof Dashboard>> = {}) {
  const props: React.ComponentProps<typeof Dashboard> = {
    apps: [],
    onStart: vi.fn().mockResolvedValue(undefined),
    onSelectApp: vi.fn(),
    onDeleteApp: vi.fn().mockResolvedValue(undefined),
    onDevMode: vi.fn(),
    ...overrides,
  }

  return {
    ...render(<Dashboard {...props} />),
    props,
  }
}

describe('Dashboard', () => {
  it('loads templates and submits the selected template request', async () => {
    const { props } = renderDashboard()

    fireEvent.click(screen.getByText('New App'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('provisioning:list-templates')
    })

    expect(screen.getByText('Open Source Templates')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('e.g. customer-feedback'), {
      target: { value: 'feedback-board' },
    })
    fireEvent.change(screen.getAllByRole('textbox')[1], {
      target: { value: 'Collect customer feedback and trends.' },
    })

    fireEvent.click(screen.getByText('Start Building'))

    await waitFor(() => {
      expect(props.onStart).toHaveBeenCalledWith({
        name: 'feedback-board',
        description: 'Collect customer feedback and trends.',
        templateQualifiedId: 'oss-bundled:web-react-vite',
        templateTitle: 'Web App',
        inputs: {
          name: 'feedback-board',
          description: 'Collect customer feedback and trends.',
        },
      })
    })
  })

  it('refreshes templates on demand', async () => {
    renderDashboard()
    fireEvent.click(screen.getByText('New App'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('provisioning:list-templates')
    })

    fireEvent.click(screen.getByText('Refresh'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('provisioning:refresh-templates')
    })
  })
})
