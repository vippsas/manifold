import type { VerdictRecord } from '../../shared/verdict-types'

/** Narrow view over recorded session verdicts, exposed to built-in plugins:
 *  `listByProject` via `verdicts:read`, `deleteByProject` via `verdicts:write`.
 *  VerdictStore satisfies this shape directly — no general IPC is exposed to
 *  sandboxed plugin webviews. */
export interface VerdictService {
  listByProject(projectId: string, limit?: number): VerdictRecord[]
  deleteByProject(projectId: string): void
}
