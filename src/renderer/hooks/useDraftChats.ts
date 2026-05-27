import { useCallback, useState } from 'react'
import type { DraftChat } from '../../shared/draft-chat'

export interface UseDraftChatsResult {
  drafts: DraftChat[]
  createDraft: (opts: Omit<DraftChat, 'id'>) => DraftChat
  discardDraft: (id: string) => void
}

export function useDraftChats(): UseDraftChatsResult {
  const [drafts, setDrafts] = useState<DraftChat[]>([])

  const createDraft = useCallback((opts: Omit<DraftChat, 'id'>): DraftChat => {
    const draft: DraftChat = { id: `draft-${crypto.randomUUID()}`, ...opts }
    setDrafts((prev) => [...prev, draft])
    return draft
  }, [])

  const discardDraft = useCallback((id: string): void => {
    setDrafts((prev) => prev.filter((d) => d.id !== id))
  }, [])

  return { drafts, createDraft, discardDraft }
}
