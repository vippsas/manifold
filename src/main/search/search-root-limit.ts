export function getSearchRootLimit(limit: number, _rootCount: number): number {
  return Math.max(1, limit)
}
