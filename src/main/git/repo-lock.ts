/**
 * Per-repository serialization for mutating git operations.
 *
 * Git takes its own filesystem locks (index.lock, worktree admin locks); two
 * concurrent mutating operations on the same repo turn most races into hard
 * "unable to lock" errors surfaced mid-spawn. Two concurrent spawns can also
 * both pass a branch-existence check and collide on the same branch name.
 *
 * `withRepoLock` chains operations keyed by the absolute repo path so that, for
 * a given repo, only one mutating operation runs at a time. Operations against
 * different repos still run concurrently.
 */

const queues = new Map<string, Promise<unknown>>()

/**
 * Run `op` exclusively with respect to other `withRepoLock` calls for the same
 * `key`. The returned promise resolves/rejects with `op`'s result. A rejected
 * `op` does not break the chain — the next queued operation still runs.
 */
export function withRepoLock<T>(key: string, op: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve()
  // Swallow the previous result/error so the tail we await never rejects, then
  // run our op. The chain advances regardless of whether prior ops failed.
  const run = prev.then(() => op(), () => op())
  // Keep the chain alive even if `run` rejects; clean up the map entry once we
  // are the last operation in the queue.
  const tail = run.catch(() => undefined)
  queues.set(key, tail)
  void tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key)
  })
  return run
}
