import type { VerdictRecord } from '../../shared/verdict-types'
import type { ProjectVerdicts } from '../../shared/plugins/api-types'

/**
 * Pure: group flat verdict records by project and resolve each repo's display name.
 * A record whose project is no longer registered falls back to its `projectId` as the
 * name (rather than being dropped), so historic sessions still surface. Sorted by name.
 */
export function groupVerdictsByProject(
  records: VerdictRecord[],
  projects: { id: string; name: string }[],
): ProjectVerdicts[] {
  const nameById = new Map(projects.map((p) => [p.id, p.name]))
  const byProject = new Map<string, VerdictRecord[]>()
  for (const record of records) {
    const bucket = byProject.get(record.projectId) ?? []
    bucket.push(record)
    byProject.set(record.projectId, bucket)
  }
  return [...byProject.entries()]
    .map(([projectId, recs]) => ({ projectId, projectName: nameById.get(projectId) ?? projectId, records: recs }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName))
}
