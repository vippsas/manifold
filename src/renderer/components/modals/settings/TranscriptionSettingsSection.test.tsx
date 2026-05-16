import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TranscriptionSettingsSection } from './TranscriptionSettingsSection'

describe('TranscriptionSettingsSection', () => {
  it('renders OpenAI key field when provider=openai', () => {
    render(<TranscriptionSettingsSection value={{ provider: 'openai' }} onChange={vi.fn()} />)
    expect(screen.getByText('OPENAI_API_KEY')).toBeTruthy()
    expect(screen.queryByText('AZURE_OPENAI_API_KEY')).toBeNull()
  })

  it('renders Azure trio when provider=azure', () => {
    render(<TranscriptionSettingsSection value={{ provider: 'azure' }} onChange={vi.fn()} />)
    expect(screen.getByText('AZURE_OPENAI_API_KEY')).toBeTruthy()
    expect(screen.getByText('AZURE_OPENAI_ENDPOINT')).toBeTruthy()
    expect(screen.getByText('AZURE_OPENAI_DEPLOYMENT')).toBeTruthy()
  })

  it('renders no key field when provider=none', () => {
    render(<TranscriptionSettingsSection value={{ provider: 'none' }} onChange={vi.fn()} />)
    expect(screen.queryByText('OPENAI_API_KEY')).toBeNull()
    expect(screen.queryByText('AZURE_OPENAI_API_KEY')).toBeNull()
  })

  it('switching provider invokes onChange with new provider', () => {
    const onChange = vi.fn()
    render(<TranscriptionSettingsSection value={{ provider: 'none' }} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('OpenAI'))
    expect(onChange).toHaveBeenCalledWith({ provider: 'openai' })
  })

  it('typing in OPENAI_API_KEY field invokes onChange', () => {
    const onChange = vi.fn()
    render(<TranscriptionSettingsSection value={{ provider: 'openai' }} onChange={onChange} />)
    const input = screen.getByText('OPENAI_API_KEY').parentElement?.querySelector('input')
    expect(input).not.toBeNull()
    fireEvent.change(input as HTMLInputElement, { target: { value: 'sk-new' } })
    expect(onChange).toHaveBeenCalledWith({ provider: 'openai', openaiApiKey: 'sk-new' })
  })

  it('shows chat model input for openai with default placeholder', () => {
    render(<TranscriptionSettingsSection value={{ provider: 'openai' }} onChange={vi.fn()} />)
    const input = screen.getByText('CHAT_MODEL').parentElement?.querySelector('input') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.placeholder).toBe('gpt-5.1')
  })

  it('emits chatModel change for openai', () => {
    const onChange = vi.fn()
    render(<TranscriptionSettingsSection value={{ provider: 'openai' }} onChange={onChange} />)
    const input = screen.getByText('CHAT_MODEL').parentElement?.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'gpt-4o-mini' } })
    expect(onChange).toHaveBeenCalledWith({ provider: 'openai', chatModel: 'gpt-4o-mini' })
  })

  it('shows azure chat deployment input for azure', () => {
    render(<TranscriptionSettingsSection value={{ provider: 'azure' }} onChange={vi.fn()} />)
    expect(screen.getByText('AZURE_OPENAI_CHAT_DEPLOYMENT')).toBeTruthy()
  })
})
