import type { Project } from './types'

export function isGitProject(project: Pick<Project, 'kind'> | null | undefined): boolean {
  // Missing `kind` on an existing project means a pre-folder-support registry
  // row — treat as git for back-compat. A null/undefined project has no kind
  // at all and must not be treated as git.
  if (!project) return false
  return project.kind !== 'folder'
}
