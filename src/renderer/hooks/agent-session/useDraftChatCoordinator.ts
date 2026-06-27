import { useCallback } from 'react'
import type { AgentSession, SpawnAgentOptions } from '../../../shared/types'
import type { DraftChat } from '../../../shared/draft-chat'
import { useDraftChats } from './useDraftChats'

export interface UseDraftChatCoordinatorResult {
  drafts: DraftChat[]
  activeDraft: DraftChat | null
  // Real session id when no draft is active, null while a draft is the active tab.
  // Hooks that are session-tied (useDiff, useFileWatcher, useCodeView, etc.)
  // MUST consume this — passing the raw activeSessionId would route a draft id
  // into IPC channels that only know about real sessions.
  effectiveSessionId: string | null
  createDraft: (opts: Omit<DraftChat, 'id'>) => DraftChat
  discardDraft: (id: string) => void
  promoteDraft: (draftId: string, firstMessage: string) => Promise<void>
}

export function useDraftChatCoordinator(
  activeSessionId: string | null,
  setActiveSession: (id: string | null) => void,
  spawnAgent: (options: SpawnAgentOptions) => Promise<AgentSession | null>,
): UseDraftChatCoordinatorResult {
  const { drafts, createDraft, discardDraft: discardDraftRaw } = useDraftChats()
  const activeDraft = drafts.find((d) => d.id === activeSessionId) ?? null
  const effectiveSessionId = activeDraft ? null : activeSessionId

  const discardDraft = useCallback((id: string): void => {
    if (activeSessionId === id) setActiveSession(null)
    discardDraftRaw(id)
  }, [activeSessionId, setActiveSession, discardDraftRaw])

  const promoteDraft = useCallback(async (draftId: string, firstMessage: string): Promise<void> => {
    const draft = drafts.find((d) => d.id === draftId)
    if (!draft) return
    let session: AgentSession | null
    try {
      session = await spawnAgent({
        projectId: draft.projectId,
        runtimeId: draft.runtimeId,
        prompt: firstMessage,
        userMessage: firstMessage,
        branchName: draft.branchName,
        ollamaModel: draft.ollamaModel,
        nonInteractive: true,
      })
    } catch (err) {
      console.error('[promoteDraft] spawnAgent failed:', err)
      return
    }
    if (!session) {
      console.error('[promoteDraft] spawnAgent returned no session — keeping draft so the user can retry')
      return
    }
    try {
      await window.electronAPI.invoke('simple:subscribe-chat', session.id)
    } catch (err) {
      console.error(`[promoteDraft] simple:subscribe-chat failed for ${session.id}:`, err)
    }
    setActiveSession(session.id)
    discardDraftRaw(draftId)
  }, [drafts, spawnAgent, discardDraftRaw, setActiveSession])

  return { drafts, activeDraft, effectiveSessionId, createDraft, discardDraft, promoteDraft }
}
