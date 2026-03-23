import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import React from 'react'
import { CreateAppDialog } from './CreateAppDialog'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
    send: vi.fn(),
  }
})

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 25))
}

describe('CreateAppDialog', () => {
  it('does not retry forever when the template catalog is empty', async () => {
    mockInvoke.mockResolvedValue({ templates: [], provisioners: [] })

    render(<CreateAppDialog open onClose={vi.fn()} onStart={vi.fn()} />)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('provisioning:list-templates')
    })
    await settle()

    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })

  it('does not retry forever when loading the template catalog fails', async () => {
    mockInvoke.mockRejectedValue(new Error('catalog offline'))

    render(<CreateAppDialog open onClose={vi.fn()} onStart={vi.fn()} />)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('provisioning:list-templates')
    })
    await settle()

    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })
})
