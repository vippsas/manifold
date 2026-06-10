import { describe, it, expect } from 'vitest'
import type { ManifoldApi, AgentSession } from 'manifold'
import { createWatchFacade, createAgentPort, resolveTranscription, IMPROVE_PROMPT_META, PERSIST_KEY } from './facade'

// Intersection (not `interface … extends`): extending a type re-exported from
// the `export =` manifold module loses the inherited members under
// tsconfig.plugins.json; the intersection keeps them.
type FakeAgent = AgentSession & {
  sent: string[]
  revealed: Array<string | undefined>
}

function fakeAgent(sessionId: string): FakeAgent {
  const sent: string[] = []
  const revealed: Array<string | undefined> = []
  return {
    sessionId,
    sent,
    revealed,
    runTurn: async () => 'ended',
    sendText: async (text: string) => { sent.push(text) },
    whenReady: async () => true,
    getStatus: async () => 'waiting',
    kill: async () => {},
    reveal: async (title?: string) => { revealed.push(title) },
  }
}

function fakeManifold(): {
  api: ManifoldApi
  agents: Map<string, FakeAgent>
  stored: Map<string, unknown>
  spawnCalls: Array<{ baseSessionId: string; opts?: { title?: string; groupId?: string } }>
  prompts: string[]
} {
  const agents = new Map<string, FakeAgent>()
  const stored = new Map<string, unknown>()
  const spawnCalls: Array<{ baseSessionId: string; opts?: { title?: string; groupId?: string } }> = []
  const prompts: string[] = []
  const api = {
    agents: {
      activeAgent: undefined as FakeAgent | undefined,
      getAgent: (sessionId: string) => agents.get(sessionId),
      spawnSibling: async (baseSessionId: string, opts?: { title?: string; groupId?: string }) => {
        spawnCalls.push({ baseSessionId, opts })
        const sibling = fakeAgent(`sib-of-${baseSessionId}`)
        agents.set(sibling.sessionId, sibling)
        return sibling
      },
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
  return { api, agents, stored, spawnCalls, prompts }
}

describe('createAgentPort — mapping onto manifold.agents', () => {
  it('spawnSibling threads opts through and wraps the returned AgentSession', async () => {
    const f = fakeManifold()
    const port = createAgentPort(f.api.agents)
    const handle = await port.spawnSibling('base-1', { title: 'Watching: T', groupId: 'run-1' })
    expect(f.spawnCalls).toEqual([{ baseSessionId: 'base-1', opts: { title: 'Watching: T', groupId: 'run-1' } }])
    expect(handle.sessionId).toBe('sib-of-base-1')
    await handle.sendText('/watch:watch …')
    expect(f.agents.get('sib-of-base-1')!.sent).toEqual(['/watch:watch …'])
    expect(await handle.whenReady(5)).toBe(true)
  })

  it('sendText and whenReady route to arbitrary sessions via getAgent', async () => {
    const f = fakeManifold()
    const meta = fakeAgent('meta-1')
    f.agents.set('meta-1', meta)
    const port = createAgentPort(f.api.agents)
    await port.sendText('meta-1', 'primer')
    expect(meta.sent).toEqual(['primer'])
    expect(await port.whenReady('meta-1', 5)).toBe(true)
    expect(await port.getStatus('meta-1')).toBe('waiting')
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
  it('revealAgent routes to getAgent(sessionId).reveal(title); missing agent is a no-op', async () => {
    const f = fakeManifold()
    const agent = fakeAgent('sib-1')
    f.agents.set('sib-1', agent)
    const facade = createWatchFacade(f.api)
    await facade.revealAgent('sib-1', 'Watching: T')
    expect(agent.revealed).toEqual(['Watching: T'])
    await expect(facade.revealAgent('gone', 'x')).resolves.toBeUndefined()
  })

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
