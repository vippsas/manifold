import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDraftChatCoordinator } from './useDraftChatCoordinator'
import type { AgentSession, SpawnAgentOptions } from '../../../shared/types'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockResolvedValue(undefined)
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  }
})

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'session-1',
    projectId: 'p1',
    runtimeId: 'claude',
    branchName: 'manifold/oslo',
    worktreePath: '/wt1',
    status: 'running',
    pid: 1,
    additionalDirs: [],
    ...overrides,
  }
}

describe('useDraftChatCoordinator.promoteDraft', () => {
  it('spawns a session with nonInteractive=true and the first message as both prompt and userMessage', async () => {
    const session = makeSession()
    const spawnAgent = vi.fn().mockResolvedValue(session)
    const setActiveSession = vi.fn()
    const { result } = renderHook(() => useDraftChatCoordinator(null, setActiveSession, spawnAgent))

    let draftId = ''
    act(() => {
      draftId = result.current.createDraft({
        projectId: 'p1',
        runtimeId: 'claude',
        branchName: 'manifold/oslo',
      }).id
    })

    await act(async () => {
      await result.current.promoteDraft(draftId, 'hello there')
    })

    const opts = spawnAgent.mock.calls[0][0] as SpawnAgentOptions
    expect(opts.nonInteractive).toBe(true)
    expect(opts.prompt).toBe('hello there')
    expect(opts.userMessage).toBe('hello there')
    expect(opts.projectId).toBe('p1')
    expect(opts.branchName).toBe('manifold/oslo')
  })

  it('subscribes the new session to chat-message events on success', async () => {
    const session = makeSession({ id: 'session-promoted' })
    const spawnAgent = vi.fn().mockResolvedValue(session)
    const { result } = renderHook(() =>
      useDraftChatCoordinator(null, vi.fn(), spawnAgent),
    )

    let draftId = ''
    act(() => {
      draftId = result.current.createDraft({ projectId: 'p1', runtimeId: 'claude' }).id
    })

    await act(async () => {
      await result.current.promoteDraft(draftId, 'first')
    })

    expect(mockInvoke).toHaveBeenCalledWith('simple:subscribe-chat', 'session-promoted')
  })

  it('switches activeSession to the new session and discards the draft on success', async () => {
    const session = makeSession({ id: 'session-promoted' })
    const spawnAgent = vi.fn().mockResolvedValue(session)
    const setActiveSession = vi.fn()
    const { result } = renderHook(() =>
      useDraftChatCoordinator(null, setActiveSession, spawnAgent),
    )

    let draftId = ''
    act(() => {
      draftId = result.current.createDraft({ projectId: 'p1', runtimeId: 'claude' }).id
    })

    await act(async () => {
      await result.current.promoteDraft(draftId, 'first')
    })

    expect(setActiveSession).toHaveBeenCalledWith('session-promoted')
    expect(result.current.drafts).toEqual([])
  })

  it('keeps the draft and does NOT discard it when spawnAgent rejects', async () => {
    const spawnAgent = vi.fn().mockRejectedValue(new Error('runtime missing'))
    const setActiveSession = vi.fn()
    const { result } = renderHook(() =>
      useDraftChatCoordinator(null, setActiveSession, spawnAgent),
    )

    let draftId = ''
    act(() => {
      draftId = result.current.createDraft({ projectId: 'p1', runtimeId: 'claude' }).id
    })

    await act(async () => {
      await result.current.promoteDraft(draftId, 'first')
    })

    expect(result.current.drafts).toHaveLength(1)
    expect(setActiveSession).not.toHaveBeenCalled()
    expect(mockInvoke).not.toHaveBeenCalledWith('simple:subscribe-chat', expect.anything())
  })

  it('keeps the draft when spawnAgent resolves to null', async () => {
    const spawnAgent = vi.fn().mockResolvedValue(null)
    const setActiveSession = vi.fn()
    const { result } = renderHook(() =>
      useDraftChatCoordinator(null, setActiveSession, spawnAgent),
    )

    let draftId = ''
    act(() => {
      draftId = result.current.createDraft({ projectId: 'p1', runtimeId: 'claude' }).id
    })

    await act(async () => {
      await result.current.promoteDraft(draftId, 'first')
    })

    expect(result.current.drafts).toHaveLength(1)
    expect(setActiveSession).not.toHaveBeenCalled()
  })

  it('still discards the draft and activates the session even if subscribe-chat rejects', async () => {
    const session = makeSession({ id: 'session-promoted' })
    const spawnAgent = vi.fn().mockResolvedValue(session)
    mockInvoke.mockRejectedValueOnce(new Error('subscribe failed'))
    const setActiveSession = vi.fn()
    const { result } = renderHook(() =>
      useDraftChatCoordinator(null, setActiveSession, spawnAgent),
    )

    let draftId = ''
    act(() => {
      draftId = result.current.createDraft({ projectId: 'p1', runtimeId: 'claude' }).id
    })

    await act(async () => {
      await result.current.promoteDraft(draftId, 'first')
    })

    expect(setActiveSession).toHaveBeenCalledWith('session-promoted')
    expect(result.current.drafts).toEqual([])
  })

  it('returns null effectiveSessionId when active tab is a draft, real id otherwise', () => {
    const spawnAgent = vi.fn()
    const { result, rerender } = renderHook(
      ({ activeId }: { activeId: string | null }) =>
        useDraftChatCoordinator(activeId, vi.fn(), spawnAgent),
      { initialProps: { activeId: 's-real' as string | null } },
    )

    expect(result.current.effectiveSessionId).toBe('s-real')

    let draftId = ''
    act(() => {
      draftId = result.current.createDraft({ projectId: 'p1', runtimeId: 'claude' }).id
    })
    rerender({ activeId: draftId })
    expect(result.current.effectiveSessionId).toBeNull()
    expect(result.current.activeDraft?.id).toBe(draftId)
  })
})
