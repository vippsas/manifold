import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { transcribeVideo, MissingKeyError } from './transcriber'

let tmpAudio: string
beforeEach(() => {
  tmpAudio = path.join(os.tmpdir(), `audio-${process.pid}-${Date.now()}-${Math.random()}.mp3`)
  fs.writeFileSync(tmpAudio, Buffer.from('fake-audio-bytes'))
})

const noopExtract = vi.fn(async (_video: string, out: string) => {
  fs.writeFileSync(out, Buffer.from('fake'))
})

describe('transcribeVideo', () => {
  it('throws MissingKeyError when provider=none', async () => {
    await expect(transcribeVideo({
      videoPath: '/dev/null',
      audioOutPath: tmpAudio,
      settings: { provider: 'none' },
      extractAudio: noopExtract,
    })).rejects.toBeInstanceOf(MissingKeyError)
  })

  it('throws MissingKeyError when openai key blank', async () => {
    await expect(transcribeVideo({
      videoPath: '/dev/null',
      audioOutPath: tmpAudio,
      settings: { provider: 'openai' },
      extractAudio: noopExtract,
    })).rejects.toBeInstanceOf(MissingKeyError)
  })

  it('throws MissingKeyError when azure endpoint missing', async () => {
    await expect(transcribeVideo({
      videoPath: '/dev/null',
      audioOutPath: tmpAudio,
      settings: { provider: 'azure', azureApiKey: 'k' },
      extractAudio: noopExtract,
    })).rejects.toBeInstanceOf(MissingKeyError)
  })

  it('hits OpenAI endpoint with bearer auth and gpt-4o-transcribe model', async () => {
    let captured: { url: string; init: RequestInit } | null = null
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      captured = { url, init }
      return new Response(JSON.stringify({ text: 'hello world' }), { status: 200 })
    }) as unknown as typeof fetch

    const result = await transcribeVideo({
      videoPath: '/dev/null',
      audioOutPath: tmpAudio,
      settings: { provider: 'openai', openaiApiKey: 'sk-test' },
      fetchImpl: fetchMock,
      extractAudio: noopExtract,
    })

    expect(captured).not.toBeNull()
    expect(captured!.url).toBe('https://api.openai.com/v1/audio/transcriptions')
    const headers = new Headers(captured!.init.headers)
    expect(headers.get('Authorization')).toBe('Bearer sk-test')
    expect(captured!.init.body).toBeInstanceOf(FormData)
    const fd = captured!.init.body as FormData
    expect(fd.get('model')).toBe('gpt-4o-transcribe')
    expect(fd.get('response_format')).toBe('json')
    expect(result).toEqual({
      segments: [{ start: 0, end: 0, text: 'hello world' }],
      source: 'openai',
    })
  })

  it('hits Azure endpoint with deployment and api-key header', async () => {
    let captured: { url: string; init: RequestInit } | null = null
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      captured = { url, init }
      return new Response(JSON.stringify({ text: 'azure works' }), { status: 200 })
    }) as unknown as typeof fetch

    const result = await transcribeVideo({
      videoPath: '/dev/null',
      audioOutPath: tmpAudio,
      settings: {
        provider: 'azure',
        azureApiKey: 'az-key',
        azureEndpoint: 'https://my.openai.azure.com/',
        azureDeployment: 'gpt-4o-transcribe',
      },
      fetchImpl: fetchMock,
      extractAudio: noopExtract,
    })

    expect(captured).not.toBeNull()
    expect(captured!.url).toBe(
      'https://my.openai.azure.com/openai/deployments/gpt-4o-transcribe/audio/transcriptions?api-version=2024-06-01',
    )
    const headers = new Headers(captured!.init.headers)
    expect(headers.get('api-key')).toBe('az-key')
    expect(result.source).toBe('azure')
    expect(result.segments[0].text).toBe('azure works')
  })

  it('defaults Azure deployment to gpt-4o-transcribe when blank', async () => {
    let captured: string | null = null
    const fetchMock = vi.fn(async (url: string) => {
      captured = url
      return new Response(JSON.stringify({ text: 'ok' }), { status: 200 })
    }) as unknown as typeof fetch
    await transcribeVideo({
      videoPath: '/dev/null',
      audioOutPath: tmpAudio,
      settings: { provider: 'azure', azureApiKey: 'k', azureEndpoint: 'https://x.openai.azure.com' },
      fetchImpl: fetchMock,
      extractAudio: noopExtract,
    })
    expect(captured).toContain('/openai/deployments/gpt-4o-transcribe/audio/transcriptions')
  })

  it('surfaces HTTP errors with status code', async () => {
    const fetchMock = vi.fn(async () => new Response('Forbidden', { status: 403 })) as unknown as typeof fetch
    await expect(transcribeVideo({
      videoPath: '/dev/null',
      audioOutPath: tmpAudio,
      settings: { provider: 'openai', openaiApiKey: 'sk-test' },
      fetchImpl: fetchMock,
      extractAudio: noopExtract,
    })).rejects.toThrow(/HTTP 403/)
  })
})
