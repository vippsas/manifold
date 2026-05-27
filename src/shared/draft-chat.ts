// Branded id so a `DraftChat['id']` cannot be confused with a real session id at
// the type level. Constructed only via `createDraftId` in useDraftChats — never
// hand-build the string elsewhere.
export type DraftId = string & { readonly __brand: 'DraftId' }

const DRAFT_PREFIX = 'draft-'

export function createDraftId(): DraftId {
  return `${DRAFT_PREFIX}${crypto.randomUUID()}` as DraftId
}

export function isDraftId(value: string | null | undefined): value is DraftId {
  return typeof value === 'string' && value.startsWith(DRAFT_PREFIX)
}

export interface DraftChat {
  id: DraftId
  projectId: string
  runtimeId: string
  branchName?: string
  ollamaModel?: string
}
