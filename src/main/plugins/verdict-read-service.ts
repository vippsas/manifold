import type { VerdictRecord } from '../../shared/verdict-types'
import type { ProjectVerdicts } from '../../shared/plugins/api-types'

/** Narrow view over recorded session verdicts, exposed to built-in plugins:
 *  `listByProject`/`listAllByProject` via `verdicts:read`, `deleteByProject` via
 *  `verdicts:write`. The store satisfies the per-project reads directly;
 *  `listAllByProject` additionally joins project display names (composed in
 *  PluginManager). No general IPC is exposed to sandboxed plugin webviews. */
export interface VerdictService {
  listByProject(projectId: string, limit?: number): VerdictRecord[]
  deleteByProject(projectId: string): void
  /** All captured verdicts grouped by repo, with display names resolved. */
  listAllByProject(): ProjectVerdicts[]
}
