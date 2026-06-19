import type { VerdictRecord } from '../../shared/verdict-types'

/** Narrow, read-only view over recorded session verdicts, exposed to built-in
 *  plugins through the `verdicts:read` capability (manifold.verdicts.listByProject).
 *  VerdictStore satisfies this shape directly — no general IPC is exposed to
 *  sandboxed plugin webviews. */
export interface VerdictReadService {
  listByProject(projectId: string, limit?: number): VerdictRecord[]
}
