// Small LRU helper for the module-level editor caches (scroll positions,
// preview state). These survive component remounts (agent switches rebuild the
// dockview layout) and so would otherwise grow monotonically as files/panes/
// sessions open and close. Capping by insertion order — Map iteration order is
// insertion order, so the first key is the least-recently inserted — keeps
// memory bounded without plumbing close events into every cache.

/** Insert into `map`, evicting the oldest entr(ies) once it exceeds `max`. */
export function setBounded<V>(map: Map<string, V>, key: string, value: V, max: number): void {
  // Re-insert so a refreshed key counts as most-recently used.
  map.delete(key)
  map.set(key, value)
  while (map.size > max) {
    const oldest = map.keys().next().value as string | undefined
    if (oldest === undefined) break
    map.delete(oldest)
  }
}

/** Add `value` to `set`, evicting the oldest member(s) once it exceeds `max`. */
export function addBounded(set: Set<string>, value: string, max: number): void {
  set.delete(value)
  set.add(value)
  while (set.size > max) {
    const oldest = set.values().next().value as string | undefined
    if (oldest === undefined) break
    set.delete(oldest)
  }
}
