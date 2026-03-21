import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { MemoryCompressor } from './memory-compressor'
import { MemoryStore } from './memory-store'
import type { SettingsStore } from '../store/settings-store'
import type { MemoryInteraction } from '../../shared/memory-types'

function createMockSettingsStore(): SettingsStore {
  return {
    getSettings: vi.fn(() => ({
      memory: { compressionRuntime: 'auto' },
    })),
  } as unknown as SettingsStore
}

let store: MemoryStore
let tmpDir: string
let compressor: MemoryCompressor

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compressor-test-'))
  store = new MemoryStore(tmpDir)
  compressor = new MemoryCompressor(store, createMockSettingsStore())
})

afterEach(() => {
  store.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const PROJECT = 'test-project'
const SESSION = 'sess-1'

describe('MemoryCompressor', () => {
  describe('parseResponse — XML parsing', () => {
    it('parses valid XML response with observations', () => {
      const xml = `
<results>
  <summary>
    <taskDescription>Fix auth bug</taskDescription>
    <whatWasDone>Patched the login handler</whatWasDone>
    <whatWasLearned>Token validation must check expiry</whatWasLearned>
    <decisionsMade>
      <decision>Use JWT library instead of manual parsing</decision>
    </decisionsMade>
    <filesChanged>
      <file>src/auth/login.ts</file>
      <file>src/auth/token.ts</file>
    </filesChanged>
  </summary>
  <observations>
    <observation>
      <type>bugfix</type>
      <title>Fixed token expiry check</title>
      <summary>Added expiry validation to the login handler</summary>
      <narrative>The login handler was not checking token expiry, causing stale sessions.</narrative>
      <facts>
        <fact>Tokens expire after 24 hours</fact>
        <fact>JWT library handles expiry automatically</fact>
      </facts>
      <concepts>
        <concept>problem-solution</concept>
        <concept>how-it-works</concept>
      </concepts>
      <filesTouched>
        <file>src/auth/login.ts</file>
      </filesTouched>
    </observation>
  </observations>
</results>`

      const result = compressor.parseResponse(xml)
      expect(result).not.toBeNull()
      expect(result!.summary.taskDescription).toBe('Fix auth bug')
      expect(result!.summary.whatWasDone).toBe('Patched the login handler')
      expect(result!.summary.whatWasLearned).toBe('Token validation must check expiry')
      expect(result!.summary.decisionsMade).toEqual(['Use JWT library instead of manual parsing'])
      expect(result!.summary.filesChanged).toEqual(['src/auth/login.ts', 'src/auth/token.ts'])

      expect(result!.observations).toHaveLength(1)
      const obs = result!.observations[0]
      expect(obs.type).toBe('bugfix')
      expect(obs.title).toBe('Fixed token expiry check')
      expect(obs.narrative).toBe('The login handler was not checking token expiry, causing stale sessions.')
      expect(obs.concepts).toEqual(['problem-solution', 'how-it-works'])
      expect(obs.facts).toEqual(['Tokens expire after 24 hours', 'JWT library handles expiry automatically'])
      expect(obs.filesTouched).toEqual(['src/auth/login.ts'])
    })

    it('parses multiple observations', () => {
      const xml = `
<results>
  <summary>
    <taskDescription>Refactor memory system</taskDescription>
    <whatWasDone>Extracted compressor</whatWasDone>
    <whatWasLearned></whatWasLearned>
    <decisionsMade></decisionsMade>
    <filesChanged></filesChanged>
  </summary>
  <observations>
    <observation>
      <type>refactor</type>
      <title>Extracted compressor class</title>
      <summary>Moved compression logic to dedicated class</summary>
      <narrative></narrative>
      <facts></facts>
      <concepts><concept>what-changed</concept></concepts>
      <filesTouched></filesTouched>
    </observation>
    <observation>
      <type>discovery</type>
      <title>FTS5 performance</title>
      <summary>FTS5 queries are fast even with large datasets</summary>
      <narrative></narrative>
      <facts><fact>10k rows searched in under 1ms</fact></facts>
      <concepts><concept>how-it-works</concept></concepts>
      <filesTouched></filesTouched>
    </observation>
  </observations>
</results>`

      const result = compressor.parseResponse(xml)
      expect(result).not.toBeNull()
      expect(result!.observations).toHaveLength(2)
      expect(result!.observations[0].type).toBe('refactor')
      expect(result!.observations[1].type).toBe('discovery')
    })

    it('normalizes invalid observation types to task_summary', () => {
      const xml = `
<results>
  <summary><taskDescription>Test</taskDescription><whatWasDone>test</whatWasDone><whatWasLearned></whatWasLearned><decisionsMade></decisionsMade><filesChanged></filesChanged></summary>
  <observations>
    <observation>
      <type>invalid_type</type>
      <title>Test observation</title>
      <summary>test</summary>
      <narrative></narrative>
      <facts></facts>
      <concepts></concepts>
      <filesTouched></filesTouched>
    </observation>
  </observations>
</results>`

      const result = compressor.parseResponse(xml)
      expect(result!.observations[0].type).toBe('task_summary')
    })

    it('filters invalid concept tags', () => {
      const xml = `
<results>
  <summary><taskDescription>Test</taskDescription><whatWasDone>test</whatWasDone><whatWasLearned></whatWasLearned><decisionsMade></decisionsMade><filesChanged></filesChanged></summary>
  <observations>
    <observation>
      <type>feature</type>
      <title>Test</title>
      <summary>test</summary>
      <narrative></narrative>
      <facts></facts>
      <concepts>
        <concept>problem-solution</concept>
        <concept>invalid-concept</concept>
        <concept>gotcha</concept>
      </concepts>
      <filesTouched></filesTouched>
    </observation>
  </observations>
</results>`

      const result = compressor.parseResponse(xml)
      expect(result!.observations[0].concepts).toEqual(['problem-solution', 'gotcha'])
    })
  })

  describe('parseResponse — JSON fallback', () => {
    it('parses valid JSON response when no XML tags found', () => {
      const json = JSON.stringify({
        summary: {
          taskDescription: 'Fix bug',
          whatWasDone: 'Fixed it',
          whatWasLearned: 'Learned stuff',
          decisionsMade: ['Decision A'],
          filesChanged: ['file.ts'],
        },
        observations: [{
          type: 'bugfix',
          title: 'Bug fix',
          summary: 'Fixed the bug',
          facts: ['fact1'],
          filesTouched: ['file.ts'],
        }],
      })

      const result = compressor.parseResponse(json)
      expect(result).not.toBeNull()
      expect(result!.summary.taskDescription).toBe('Fix bug')
      expect(result!.observations[0].type).toBe('bugfix')
    })

    it('parses JSON with markdown fencing', () => {
      const json = '```json\n' + JSON.stringify({
        summary: {
          taskDescription: 'Test',
          whatWasDone: 'Tested',
          whatWasLearned: '',
          decisionsMade: [],
          filesChanged: [],
        },
        observations: [],
      }) + '\n```'

      const result = compressor.parseResponse(json)
      expect(result).not.toBeNull()
      expect(result!.summary.taskDescription).toBe('Test')
    })

    it('returns null for unparseable input', () => {
      expect(compressor.parseResponse('just some random text')).toBeNull()
    })

    it('returns null for JSON missing required fields', () => {
      expect(compressor.parseResponse(JSON.stringify({ foo: 'bar' }))).toBeNull()
    })
  })

  describe('buildRegexFallbackResult', () => {
    it('produces observations with concepts from keyword matching', () => {
      const interactions: MemoryInteraction[] = [
        { id: 1, projectId: PROJECT, sessionId: SESSION, role: 'user', text: 'Fix the authentication bug in the login handler', timestamp: 1000 },
        { id: 2, projectId: PROJECT, sessionId: SESSION, role: 'agent', text: 'I fixed the bug by updating the token validation. The problem was that expired tokens were being accepted.', timestamp: 2000 },
      ]

      const result = compressor.buildRegexFallbackResult(interactions, { taskDescription: 'Fix auth bug' })
      expect(result.observations).toHaveLength(1)
      expect(result.observations[0].concepts).toBeDefined()
      expect(result.observations[0].concepts!.length).toBeGreaterThan(0)
      expect(result.observations[0].narrative).toBeDefined()
    })

    it('detects new observation types', () => {
      const featureInteractions: MemoryInteraction[] = [
        { id: 1, projectId: PROJECT, sessionId: SESSION, role: 'user', text: 'Implement a new caching layer for API responses', timestamp: 1000 },
        { id: 2, projectId: PROJECT, sessionId: SESSION, role: 'agent', text: 'I added a new Redis cache implementation for the API response caching layer.', timestamp: 2000 },
      ]
      const result = compressor.buildRegexFallbackResult(featureInteractions)
      expect(result.observations[0].type).toBe('feature')
    })

    it('uses tool events for filesChanged when available', () => {
      const interactions: MemoryInteraction[] = [
        {
          id: 1, projectId: PROJECT, sessionId: SESSION, role: 'agent',
          text: 'I updated the store configuration for better performance.',
          timestamp: 1000,
          toolEvents: [
            { toolName: 'Edit', inputSummary: 'src/store/config.ts', timestamp: 1000 },
            { toolName: 'Read', inputSummary: 'src/store/index.ts', timestamp: 1001 },
          ],
        },
      ]
      const result = compressor.buildRegexFallbackResult(interactions)
      expect(result.summary.filesChanged).toContain('src/store/config.ts')
    })

    it('handles empty interactions gracefully', () => {
      const result = compressor.buildRegexFallbackResult([], { taskDescription: 'Empty session' })
      expect(result.summary.taskDescription).toBe('Empty session')
      expect(result.observations).toHaveLength(1)
      expect(result.observations[0].concepts).toEqual([])
      expect(result.observations[0].narrative).toBe('')
    })
  })

  describe('tool events accumulation', () => {
    it('stores and retrieves tool events per session', () => {
      compressor.addToolEvents('sess-1', [
        { toolName: 'Read', inputSummary: 'file.ts', timestamp: 1000 },
      ])
      compressor.addToolEvents('sess-1', [
        { toolName: 'Edit', inputSummary: 'file.ts', timestamp: 2000 },
      ])

      const events = compressor.getToolEvents('sess-1')
      expect(events).toHaveLength(2)
      expect(events[0].toolName).toBe('Read')
      expect(events[1].toolName).toBe('Edit')
    })

    it('returns empty array for unknown session', () => {
      expect(compressor.getToolEvents('unknown')).toEqual([])
    })
  })
})
