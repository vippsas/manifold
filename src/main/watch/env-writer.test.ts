import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { writeWatchEnv } from './env-writer'

const tmpHome = path.join(os.tmpdir(), `manifold-watch-test-${process.pid}-${Date.now()}`)
const cfgDir = path.join(tmpHome, '.config', 'watch')
const cfgFile = path.join(cfgDir, '.env')

beforeEach(() => { fs.rmSync(tmpHome, { recursive: true, force: true }) })
afterEach(() => { fs.rmSync(tmpHome, { recursive: true, force: true }) })

describe('writeWatchEnv', () => {
  it('writes OpenAI key when provider=openai', () => {
    writeWatchEnv({ provider: 'openai', openaiApiKey: 'sk-test' }, tmpHome)
    expect(fs.readFileSync(cfgFile, 'utf-8')).toContain('OPENAI_API_KEY=sk-test')
  })

  it('writes Azure trio when provider=azure', () => {
    writeWatchEnv({
      provider: 'azure',
      azureApiKey: 'az',
      azureEndpoint: 'https://x.openai.azure.com',
      azureDeployment: 'whisper-1',
    }, tmpHome)
    const content = fs.readFileSync(cfgFile, 'utf-8')
    expect(content).toContain('AZURE_OPENAI_API_KEY=az')
    expect(content).toContain('AZURE_OPENAI_ENDPOINT=https://x.openai.azure.com')
    expect(content).toContain('AZURE_OPENAI_DEPLOYMENT=whisper-1')
  })

  it('clears file when provider=none', () => {
    fs.mkdirSync(cfgDir, { recursive: true })
    fs.writeFileSync(cfgFile, 'OPENAI_API_KEY=old')
    writeWatchEnv({ provider: 'none' }, tmpHome)
    expect(fs.readFileSync(cfgFile, 'utf-8').trim()).toBe('')
  })

  it('omits empty values', () => {
    writeWatchEnv({ provider: 'openai' }, tmpHome)
    expect(fs.readFileSync(cfgFile, 'utf-8')).not.toContain('OPENAI_API_KEY=')
  })

  it('writes file with 0600 permissions', () => {
    writeWatchEnv({ provider: 'openai', openaiApiKey: 'k' }, tmpHome)
    const mode = fs.statSync(cfgFile).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('does not leak openai key when provider=azure', () => {
    writeWatchEnv({ provider: 'azure', azureApiKey: 'az', openaiApiKey: 'sk-leak' }, tmpHome)
    expect(fs.readFileSync(cfgFile, 'utf-8')).not.toMatch(/^OPENAI_API_KEY=/m)
  })
})
