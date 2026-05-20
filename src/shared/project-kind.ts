import type { Project } from './types'

export function isGitProject(project: Pick<Project, 'kind'> | null | undefined): boolean {
  return project?.kind !== 'folder'
}
