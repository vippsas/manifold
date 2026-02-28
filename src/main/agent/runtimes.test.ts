import { describe, it, expect } from 'vitest'
import { BUILT_IN_RUNTIMES, getRuntimeById, listRuntimes, listRuntimesWithStatus } from './runtimes'

describe('runtimes', () => {
  describe('BUILT_IN_RUNTIMES', () => {
    it('contains claude, codex, copilot, gemini, ollama-claude, and ollama-codex', () => {
      const ids = BUILT_IN_RUNTIMES.map((r) => r.id)
      expect(ids).toContain('claude')
      expect(ids).toContain('codex')
      expect(ids).toContain('copilot')
      expect(ids).toContain('gemini')
      expect(ids).toContain('ollama-claude')
      expect(ids).toContain('ollama-codex')
    })

    it('has exactly 6 built-in runtimes', () => {
      expect(BUILT_IN_RUNTIMES).toHaveLength(6)
    })

    it('copilot runtime has the expected binary and args', () => {
      const copilot = BUILT_IN_RUNTIMES.find((r) => r.id === 'copilot')
      expect(copilot?.binary).toBe('copilot')
      expect(copilot?.args).toContain('--yolo')
    })

    it('each runtime has required fields', () => {
      for (const runtime of BUILT_IN_RUNTIMES) {
        expect(runtime.id).toBeTruthy()
        expect(runtime.name).toBeTruthy()
        expect(runtime.binary).toBeTruthy()
      }
    })

    it('claude runtime has the expected binary', () => {
      const claude = BUILT_IN_RUNTIMES.find((r) => r.id === 'claude')
      expect(claude?.binary).toBe('claude')
      expect(claude?.args).toContain('--dangerously-skip-permissions')
    })

    it('codex runtime has the expected binary', () => {
      const codex = BUILT_IN_RUNTIMES.find((r) => r.id === 'codex')
      expect(codex?.binary).toBe('codex')
    })

    it('gemini runtime has the expected binary', () => {
      const gemini = BUILT_IN_RUNTIMES.find((r) => r.id === 'gemini')
      expect(gemini?.binary).toBe('gemini')
    })

    it('ollama-claude runtime uses ollama binary with launch args and needsModel', () => {
      const ollamaClaude = BUILT_IN_RUNTIMES.find((r) => r.id === 'ollama-claude')
      expect(ollamaClaude).toBeDefined()
      expect(ollamaClaude!.binary).toBe('ollama')
      expect(ollamaClaude!.args).toEqual(['launch', 'claude'])
      expect(ollamaClaude!.needsModel).toBe(true)
    })

    it('ollama-codex runtime uses ollama binary with launch args and needsModel', () => {
      const ollamaCodex = BUILT_IN_RUNTIMES.find((r) => r.id === 'ollama-codex')
      expect(ollamaCodex).toBeDefined()
      expect(ollamaCodex!.binary).toBe('ollama')
      expect(ollamaCodex!.args).toEqual(['launch', 'codex'])
      expect(ollamaCodex!.needsModel).toBe(true)
    })

    it('ollama runtimes have no aiModelArgs', () => {
      const ollamaClaude = BUILT_IN_RUNTIMES.find((r) => r.id === 'ollama-claude')
      const ollamaCodex = BUILT_IN_RUNTIMES.find((r) => r.id === 'ollama-codex')
      expect(ollamaClaude!.aiModelArgs).toBeUndefined()
      expect(ollamaCodex!.aiModelArgs).toBeUndefined()
    })

    it('all runtimes have waitingPattern defined', () => {
      for (const runtime of BUILT_IN_RUNTIMES) {
        expect(runtime.waitingPattern).toBeTruthy()
      }
    })
  })

  describe('getRuntimeById', () => {
    it('returns the claude runtime', () => {
      const runtime = getRuntimeById('claude')
      expect(runtime).toBeDefined()
      expect(runtime!.id).toBe('claude')
      expect(runtime!.name).toBe('Claude Code')
    })

    it('returns the codex runtime', () => {
      const runtime = getRuntimeById('codex')
      expect(runtime).toBeDefined()
      expect(runtime!.id).toBe('codex')
    })

    it('returns the gemini runtime', () => {
      const runtime = getRuntimeById('gemini')
      expect(runtime).toBeDefined()
      expect(runtime!.id).toBe('gemini')
    })

    it('returns undefined for unknown id', () => {
      expect(getRuntimeById('unknown')).toBeUndefined()
    })

    it('returns undefined for empty string', () => {
      expect(getRuntimeById('')).toBeUndefined()
    })
  })

  describe('listRuntimes', () => {
    it('returns a copy of all runtimes', () => {
      const runtimes = listRuntimes()
      expect(runtimes).toHaveLength(BUILT_IN_RUNTIMES.length)
    })

    it('returns a new array instance (not the same reference)', () => {
      const a = listRuntimes()
      const b = listRuntimes()
      expect(a).not.toBe(b)
    })

    it('contains the same runtimes as BUILT_IN_RUNTIMES', () => {
      const runtimes = listRuntimes()
      for (const runtime of BUILT_IN_RUNTIMES) {
        expect(runtimes.find((r) => r.id === runtime.id)).toBeDefined()
      }
    })
  })

  describe('listRuntimesWithStatus', () => {
    it('returns all built-in runtimes with installed field', async () => {
      const runtimes = await listRuntimesWithStatus()
      expect(runtimes).toHaveLength(BUILT_IN_RUNTIMES.length)
      for (const rt of runtimes) {
        expect(typeof rt.installed).toBe('boolean')
      }
    })

    it('each runtime has installed as a boolean', async () => {
      const runtimes = await listRuntimesWithStatus()
      for (const rt of runtimes) {
        expect(rt.installed === true || rt.installed === false).toBe(true)
      }
    })
  })
})
