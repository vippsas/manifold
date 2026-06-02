import Dexie, { type EntityTable } from 'dexie'

// One row of feedback per search-prominence option, persisted locally in IndexedDB.
export interface OptionFeedback {
  optionId: string
  rating: number // 0–5 stars
  notes: string
  updatedAt: number
}

const db = new Dexie('SearchUxLab') as Dexie & {
  feedback: EntityTable<OptionFeedback, 'optionId'>
}

db.version(1).stores({
  feedback: 'optionId, rating, updatedAt',
})

export async function saveFeedback(
  optionId: string,
  patch: Partial<Omit<OptionFeedback, 'optionId'>>
): Promise<void> {
  const existing = await db.feedback.get(optionId)
  await db.feedback.put({
    optionId,
    rating: existing?.rating ?? 0,
    notes: existing?.notes ?? '',
    ...patch,
    updatedAt: Date.now(),
  })
}

export { db }
