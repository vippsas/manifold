import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectWatchSetup, clearWatchSetupCache } from './setup-detector'

beforeEach(() => { clearWatchSetupCache() })

describe('detectWatchSetup', () => {
  it('returns all true when which() returns true and OpenAI key configured', () => {
    const status = detectWatchSetup({
      cacheMs: 0,
      which: () => true,
      getTranscription: () => ({ provider: 'openai', openaiApiKey: 'sk-x' }),
    })
    expect(status).toEqual({
      ffmpeg: true, ytdlp: true, hasBrew: true, provider: 'openai', hasApiKey: true,
    })
  })

  it('returns false flags when which() returns false', () => {
    const status = detectWatchSetup({ cacheMs: 0, which: () => false, hasBundled: () => false })
    expect(status).toEqual({
      ffmpeg: false, ytdlp: false, hasBrew: false, provider: 'none', hasApiKey: false,
    })
  })

  it('reports ytdlp=true when only the bundled binary is present', () => {
    const status = detectWatchSetup({
      cacheMs: 0,
      which: () => false,
      hasBundled: (b) => b === 'yt-dlp',
    })
    expect(status.ytdlp).toBe(true)
    expect(status.ffmpeg).toBe(false)
  })

  it('flags missing API key when provider is openai but no key', () => {
    const status = detectWatchSetup({
      cacheMs: 0, which: () => true,
      getTranscription: () => ({ provider: 'openai' }),
    })
    expect(status.hasApiKey).toBe(false)
  })

  it('requires both key and endpoint for azure', () => {
    const onlyKey = detectWatchSetup({
      cacheMs: 0, which: () => true,
      getTranscription: () => ({ provider: 'azure', azureApiKey: 'k' }),
    })
    expect(onlyKey.hasApiKey).toBe(false)
    clearWatchSetupCache()
    const both = detectWatchSetup({
      cacheMs: 0, which: () => true,
      getTranscription: () => ({ provider: 'azure', azureApiKey: 'k', azureEndpoint: 'https://x' }),
    })
    expect(both.hasApiKey).toBe(true)
  })

  it('caches results within cacheMs window', () => {
    const which = vi.fn(() => true)
    const hasBundled = () => false
    detectWatchSetup({ cacheMs: 10_000, which, hasBundled })
    detectWatchSetup({ cacheMs: 10_000, which, hasBundled })
    expect(which.mock.calls.length).toBe(3)
  })

  it('skips cache when cacheMs is 0', () => {
    const which = vi.fn(() => true)
    const hasBundled = () => false
    detectWatchSetup({ cacheMs: 0, which, hasBundled })
    detectWatchSetup({ cacheMs: 0, which, hasBundled })
    expect(which.mock.calls.length).toBe(6)
  })
})
