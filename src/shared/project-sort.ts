import type { Project } from './types'

type ProjectLike = Pick<Project, 'name' | 'path'>

const SORT_OPTIONS: Intl.CollatorOptions = {
  numeric: true,
  sensitivity: 'base',
}

export function compareProjectNames(left: ProjectLike, right: ProjectLike): number {
  const byName = left.name.localeCompare(right.name, undefined, SORT_OPTIONS)
  if (byName !== 0) return byName
  return left.path.localeCompare(right.path, undefined, SORT_OPTIONS)
}

export function sortProjectsByName<T extends ProjectLike>(projects: readonly T[]): T[] {
  return [...projects].sort(compareProjectNames)
}
