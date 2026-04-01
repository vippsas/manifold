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
      return Promise.resolve({
        templates: [
          {
            id: 'vercel-starter',
            qualifiedId: 'vercel-bundled:vercel-starter',
            title: 'Web App',
            description: 'Starter app.',
            category: 'Web',
            tags: ['react'],
            provisionerId: 'vercel-bundled',
            provisionerLabel: 'Vercel Templates',
            catalogSource: 'cache',
            isStale: true,
            paramsSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', title: 'App name', placeholder: 'e.g. customer-feedback' },
                description: { type: 'string', title: 'Describe what you want to build', multiline: true },
                visibility: {
                  type: 'string',
                  title: 'Visibility',
                  enum: [
                    { value: 'private', label: 'Private' },
                    { value: 'public', label: 'Public' },
                  ],
                  default: 'private',
                },
                retentionDays: { type: 'integer', title: 'Retention Days', default: 30, minimum: 7 },
              },
              required: ['name', 'description'],
            },
          },
          {
            id: 'tool-researcher',
            qualifiedId: 'vercel-bundled:tool-researcher',
            title: 'Tool Researcher',
            description: 'Research workflow.',
            category: 'Research',
            tags: ['research'],
            provisionerId: 'vercel-bundled',
            provisionerLabel: 'Vercel Templates',
            catalogSource: 'cache',
            promptInstructions: 'This repository is a research workspace, not a React app.\n\n',
            paramsSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', title: 'App name', placeholder: 'e.g. lovable-evaluation' },
                description: { type: 'string', title: 'What tool should be evaluated?', multiline: true },
              },
              required: ['name', 'description'],
            },
          },
        ],
        provisioners: [
          {
            provisionerId: 'vercel-bundled',
            provisionerLabel: 'Vercel Templates',
            enabled: true,
            source: 'cache',
            state: 'healthy',
            templateCount: 2,
            summary: 'Using cached templates',
            isStale: true,
          },
        ],
      })
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

    expect(screen.getByText('Vercel Templates')).toBeInTheDocument()
    expect(screen.getByText('Cached')).toBeInTheDocument()
    expect(screen.getByText('Stale')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('e.g. customer-feedback'), {
      target: { value: 'feedback-board' },
    })
    fireEvent.change(screen.getAllByRole('textbox')[1], {
      target: { value: 'Collect customer feedback and trends.' },
    })
    fireEvent.change(screen.getByDisplayValue('Private'), {
      target: { value: 'public' },
    })
    fireEvent.change(screen.getByDisplayValue('30'), {
      target: { value: '21' },
    })

    fireEvent.click(screen.getByText('Start Building'))

    await waitFor(() => {
      expect(props.onStart).toHaveBeenCalledWith({
        name: 'feedback-board',
        description: 'Collect customer feedback and trends.',
        templateQualifiedId: 'vercel-bundled:vercel-starter',
        templateTitle: 'Web App',
        inputs: {
          name: 'feedback-board',
          description: 'Collect customer feedback and trends.',
          visibility: 'public',
          retentionDays: 21,
        },
      })
    })
  })

  it('submits the selected secondary template with its prompt instructions', async () => {
    const { props } = renderDashboard()

    fireEvent.click(screen.getByText('New App'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('provisioning:list-templates')
    })

    fireEvent.change(screen.getByDisplayValue('Web App - Vercel Templates'), {
      target: { value: 'vercel-bundled:tool-researcher' },
    })
    fireEvent.change(screen.getByPlaceholderText('e.g. lovable-evaluation'), {
      target: { value: 'lovable-evaluation' },
    })
    fireEvent.change(screen.getAllByRole('textbox')[1], {
      target: { value: 'Evaluate Lovable for internal prototyping.' },
    })

    fireEvent.click(screen.getByText('Start Building'))

    await waitFor(() => {
      expect(props.onStart).toHaveBeenCalledWith({
        name: 'lovable-evaluation',
        description: 'Evaluate Lovable for internal prototyping.',
        templateQualifiedId: 'vercel-bundled:tool-researcher',
        templateTitle: 'Tool Researcher',
        promptInstructions: 'This repository is a research workspace, not a React app.\n\n',
        inputs: {
          name: 'lovable-evaluation',
          description: 'Evaluate Lovable for internal prototyping.',
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
