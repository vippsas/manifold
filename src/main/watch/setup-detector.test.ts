import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { detectWatchSetup, clearWatchSetupCache } from './setup-detector'

const tmpHome = path.join(os.tmpdir(), `watch-detector-${process.pid}-${Date.now()}`)
const cfgFile = path.join(tmpHome, '.config', 'watch', '.env')

beforeEach(() => {
  clearWatchSetupCache()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('detectWatchSetup', () => {
  it('returns all true when which() returns true and OpenAI key exists', () => {
    fs.mkdirSync(path.dirname(cfgFile), { recursive: true })
    fs.writeFileSync(cfgFile, 'OPENAI_API_KEY=sk-x\n')
    const status = detectWatchSetup({ homeDir: tmpHome, cacheMs: 0, which: () => true })
    expect(status).toEqual({ ffmpeg: true, ytdlp: true, claudeCli: true, apiKeyKind: 'openai' })
  })

  it('returns false flags when which() returns false', () => {
    const status = detectWatchSetup({ homeDir: tmpHome, cacheMs: 0, which: () => false })
    expect(status).toEqual({ ffmpeg: false, ytdlp: false, claudeCli: false, apiKeyKind: null })
  })

  it('detects azure key kind from env file', () => {
    fs.mkdirSync(path.dirname(cfgFile), { recursive: true })
    fs.writeFileSync(cfgFile, 'AZURE_OPENAI_API_KEY=k\n')
    const status = detectWatchSetup({ homeDir: tmpHome, cacheMs: 0, which: () => true })
    expect(status.apiKeyKind).toBe('azure')
  })

  it('caches results within cacheMs window', () => {
    const which = vi.fn(() => true)
    detectWatchSetup({ homeDir: tmpHome, cacheMs: 10_000, which })
    detectWatchSetup({ homeDir: tmpHome, cacheMs: 10_000, which })
    expect(which.mock.calls.length).toBe(3)
  })

  it('skips cache when cacheMs is 0', () => {
    const which = vi.fn(() => true)
    detectWatchSetup({ homeDir: tmpHome, cacheMs: 0, which })
    detectWatchSetup({ homeDir: tmpHome, cacheMs: 0, which })
    expect(which.mock.calls.length).toBe(6)
  })
})
