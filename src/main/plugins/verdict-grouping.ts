import type { VerdictRecord } from '../../shared/verdict-types'
import type { ProjectVerdicts } from '../../shared/plugins/api-types'

/**
 * Pure: group flat verdict records by project and resolve each repo's display name.
 * Records whose project is **no longer registered** are dropped — the dashboard ignores
 * removed repos (their stored verdicts keep only a project UUID, no recoverable name).
 * Sorted by name.
 */
export function groupVerdictsByProject(
  records: VerdictRecord[],
  projects: { id: string; name: string }[],
): ProjectVerdicts[] {
  const nameById = new Map(projects.map((p) => [p.id, p.name]))
  const byProject = new Map<string, VerdictRecord[]>()
  for (const record of records) {
    if (!nameById.has(record.projectId)) continue // repo no longer registered → ignore
    const bucket = byProject.get(record.projectId) ?? []
    bucket.push(record)
    byProject.set(record.projectId, bucket)
  }
  return [...byProject.entries()]
    .map(([projectId, recs]) => ({ projectId, projectName: nameById.get(projectId) ?? projectId, records: recs }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName))
}
