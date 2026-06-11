import { describe, it, expect } from 'vitest'
import type { ManifoldApi, AgentSession } from 'manifold'
import { createWatchFacade, createAgentPort, resolveTranscription, IMPROVE_PROMPT_META, PERSIST_KEY } from './facade'

// Intersection (not `interface … extends`): extending a type re-exported from
// the `export =` manifold module loses the inherited members under
// tsconfig.plugins.json; the intersection keeps them.
type FakeAgent = AgentSession & {
  sent: string[]
}

function fakeAgent(sessionId: string): FakeAgent {
  const sent: string[] = []
  return {
    sessionId,
    sent,
    runTurn: async () => 'ended',
    sendText: async (text: string) => { sent.push(text) },
    whenReady: async () => true,
    getStatus: async () => 'waiting',
    kill: async () => {},
    reveal: async () => {},
  }
}

function fakeManifold(): {
  api: ManifoldApi
  agents: Map<string, FakeAgent>
  stored: Map<string, unknown>
  prompts: string[]
} {
  const agents = new Map<string, FakeAgent>()
  const stored = new Map<string, unknown>()
  const prompts: string[] = []
  const api = {
    agents: {
      activeAgent: undefined as FakeAgent | undefined,
      getAgent: (sessionId: string) => agents.get(sessionId),
    },
    transcription: { get: async () => undefined },
    lm: {
      selectChatModels: async () => [{
        id: 'm1',
        sendRequest: async (prompt: string) => { prompts.push(prompt); return { text: '  improved text  ' } },
      }],
    },
    storage: {
      global: {
        get: async <T,>(key: string, defaultValue?: T) => (stored.has(key) ? (stored.get(key) as T) : defaultValue),
        update: async (key: string, value: unknown) => { stored.set(key, value) },
      },
    },
    workspace: {
      activeProject: { id: 'p1', name: 'proj', path: '/p' },
      activeSession: { id: 's1', status: 'running', worktreePath: '/wt/s1' },
    },
  } as unknown as ManifoldApi
  return { api, agents, stored, prompts }
}

describe('createAgentPort — mapping onto manifold.agents', () => {
  it('sendText and whenReady route to sessions via getAgent', async () => {
    const f = fakeManifold()
    const base = fakeAgent('base-1')
    f.agents.set('base-1', base)
    const port = createAgentPort(f.api.agents)
    await port.sendText('base-1', '/watch:watch …')
    expect(base.sent).toEqual(['/watch:watch …'])
    expect(await port.whenReady('base-1', 5)).toBe(true)
    expect(await port.getStatus('base-1')).toBe('waiting')
  })

  it('missing sessions: getStatus → missing, whenReady → false, sendText throws', async () => {
    const port = createAgentPort(fakeManifold().api.agents)
    expect(await port.getStatus('gone')).toBe('missing')
    expect(await port.whenReady('gone', 5)).toBe(false)
    await expect(port.sendText('gone', 'x')).rejects.toThrow('gone')
  })
})

describe('resolveTranscription', () => {
  it("maps undefined settings to provider 'none'", async () => {
    const f = fakeManifold()
    expect(await resolveTranscription(f.api)).toEqual({ provider: 'none' })
  })

  it('passes configured settings through', async () => {
    const f = fakeManifold()
    f.api.transcription.get = async () => ({ provider: 'openai', openaiApiKey: 'k' })
    expect(await resolveTranscription(f.api)).toEqual({ provider: 'openai', openaiApiKey: 'k' })
  })
})

describe('createWatchFacade', () => {
  it('persist/getPersisted round-trip through the single storage.global key', async () => {
    const f = fakeManifold()
    const facade = createWatchFacade(f.api)
    expect(await facade.getPersisted()).toEqual({})
    await facade.persist('watch.url', 'https://a')
    await facade.persist('watch.previewCache', { entries: [] })
    expect(await facade.getPersisted()).toEqual({ 'watch.url': 'https://a', 'watch.previewCache': { entries: [] } })
    expect([...f.stored.keys()]).toEqual([PERSIST_KEY])
  })

  it('getActiveSessionId maps activeAgent to its sessionId (null when none)', () => {
    const f = fakeManifold()
    const facade = createWatchFacade(f.api)
    expect(facade.getActiveSessionId()).toBeNull()
    ;(f.api.agents as { activeAgent?: AgentSession }).activeAgent = fakeAgent('s1')
    expect(facade.getActiveSessionId()).toBe('s1')
  })

  it('improvePrompt sends the ported instruction + draft to the first chat model and trims the reply', async () => {
    const f = fakeManifold()
    const facade = createWatchFacade(f.api)
    const improved = await facade.improvePrompt(' summarize the demo ')
    expect(improved).toBe('improved text')
    expect(f.prompts).toEqual([`${IMPROVE_PROMPT_META}\nsummarize the demo`])
    expect(IMPROVE_PROMPT_META).toContain('Return ONLY the improved prompt text')
  })

  it('improvePrompt throws when no language model is available', async () => {
    const f = fakeManifold()
    f.api.lm.selectChatModels = async () => []
    const facade = createWatchFacade(f.api)
    await expect(facade.improvePrompt('draft')).rejects.toThrow('no language model available')
  })
})
