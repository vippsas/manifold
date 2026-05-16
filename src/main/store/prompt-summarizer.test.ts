import { describe, it, expect, vi } from 'vitest'
import { summarizeMiddle, DEFAULT_CHAT_MODEL } from './prompt-summarizer'
import type { AiServiceSettings } from '../../shared/watch-types'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('summarizeMiddle', () => {
  it('returns fallback when provider is none', async () => {
    const out = await summarizeMiddle('long middle', { provider: 'none' }, fetch)
    expect(out).toBe('[middle omitted — 11 chars]')
  })

  it('returns fallback when openai key missing', async () => {
    const out = await summarizeMiddle('long middle', { provider: 'openai' }, fetch)
    expect(out).toBe('[middle omitted — 11 chars]')
  })

  it('uses default model when chatModel unset', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      expect(body.model).toBe(DEFAULT_CHAT_MODEL)
      return jsonResponse({ choices: [{ message: { content: 'summary text' } }] })
    })
    const settings: AiServiceSettings = { provider: 'openai', openaiApiKey: 'sk-x' }
    const out = await summarizeMiddle('middle content', settings, fetchMock as unknown as typeof fetch)
    expect(out).toBe('summary text')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('uses configured chatModel for openai', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      expect(body.model).toBe('gpt-4o-mini')
      return jsonResponse({ choices: [{ message: { content: 'ok' } }] })
    })
    const settings: AiServiceSettings = { provider: 'openai', openaiApiKey: 'sk', chatModel: 'gpt-4o-mini' }
    await summarizeMiddle('m', settings, fetchMock as unknown as typeof fetch)
  })

  it('falls back on non-2xx', async () => {
    const fetchMock = vi.fn(async () => new Response('rate limited', { status: 429 }))
    const settings: AiServiceSettings = { provider: 'openai', openaiApiKey: 'sk' }
    const out = await summarizeMiddle('hello world', settings, fetchMock as unknown as typeof fetch)
    expect(out).toBe('[middle omitted — 11 chars]')
  })

  it('falls back on network error', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('net down') })
    const settings: AiServiceSettings = { provider: 'openai', openaiApiKey: 'sk' }
    const out = await summarizeMiddle('hello', settings, fetchMock as unknown as typeof fetch)
    expect(out).toBe('[middle omitted — 5 chars]')
  })

  it('hits azure deployment URL', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toMatch(/openai\.azure\.com\/openai\/deployments\/chatdep\/chat\/completions/)
      return jsonResponse({ choices: [{ message: { content: 'azure summary' } }] })
    })
    const settings: AiServiceSettings = {
      provider: 'azure',
      azureApiKey: 'k',
      azureEndpoint: 'https://res.openai.azure.com',
      azureChatDeployment: 'chatdep',
    }
    const out = await summarizeMiddle('m', settings, fetchMock as unknown as typeof fetch)
    expect(out).toBe('azure summary')
  })

  it('azure falls back when chat deployment missing', async () => {
    const fetchMock = vi.fn()
    const settings: AiServiceSettings = {
      provider: 'azure', azureApiKey: 'k', azureEndpoint: 'https://x',
    }
    const out = await summarizeMiddle('middle', settings, fetchMock as unknown as typeof fetch)
    expect(out).toBe('[middle omitted — 6 chars]')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caps the summary at 200 chars', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: 'x'.repeat(500) } }] }),
    )
    const settings: AiServiceSettings = { provider: 'openai', openaiApiKey: 'sk' }
    const out = await summarizeMiddle('m', settings, fetchMock as unknown as typeof fetch)
    expect(out.length).toBeLessThanOrEqual(200)
  })
})
