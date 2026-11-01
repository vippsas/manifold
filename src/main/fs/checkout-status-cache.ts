import * as path from 'node:path'

export const CHECKOUT_STATUS_INTERVAL_MS = 2000

interface RawStatus {
  status: string
  branch: string
  successfulAt: number
}

export interface CheckoutStatusCacheEntry {
  generation: number
  raw?: RawStatus
}

// Only pollers register entries. Reads never create entries or start timers.
const entries = new Map<string, CheckoutStatusCacheEntry>()

export function registerCheckoutStatus(checkout: string): CheckoutStatusCacheEntry {
  const entry = { generation: 0 }
  entries.set(path.resolve(checkout), entry)
  return entry
}

export function removeCheckoutStatus(checkout: string, entry: CheckoutStatusCacheEntry): void {
  const key = path.resolve(checkout)
  if (entries.get(key) === entry) entries.delete(key)
}

export function getCachedCheckoutStatus(checkout: string): RawStatus | undefined {
  const raw = entries.get(path.resolve(checkout))?.raw
  return raw && Date.now() - raw.successfulAt < CHECKOUT_STATUS_INTERVAL_MS ? raw : undefined
}

function contains(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

/** Git handlers name a checkout; file handlers name the changed file/directory.
 * Invalidate containing checkouts, plus nested checkouts for directory changes. */
export function invalidateCheckoutStatus(changedPath: string): void {
  const key = path.resolve(changedPath)
  for (const [checkout, entry] of entries) {
    if (!contains(checkout, key) && !contains(key, checkout)) continue
    entry.generation++
    entry.raw = undefined
  }
}
