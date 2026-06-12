import { fileName, parentPath, splitPathSegments } from './code-viewer-paths'

export interface FileTabLabel {
  name: string
  description: string
}

export function getFileTabLabels(filePaths: string[]): FileTabLabel[] {
  const labels = filePaths.map((path) => ({ name: fileName(path), description: '' }))
  const duplicateGroups = new Map<string, number[]>()

  for (let index = 0; index < filePaths.length; index++) {
    const name = labels[index].name
    const indices = duplicateGroups.get(name)
    if (indices) indices.push(index)
    else duplicateGroups.set(name, [index])
  }

  for (const indices of duplicateGroups.values()) {
    if (indices.length <= 1) continue

    const descriptions = getUniqueDirectorySuffixes(indices.map((index) => filePaths[index]))
    for (let i = 0; i < indices.length; i++) {
      labels[indices[i]].description = descriptions[i]
    }
  }

  return labels
}

function getUniqueDirectorySuffixes(filePaths: string[]): string[] {
  const directorySegments = filePaths.map((filePath) => splitPathSegments(parentPath(filePath)))
  const commonPrefixLength = getCommonPrefixLength(directorySegments)
  const relativeDirectorySegments = directorySegments.map((segments) => segments.slice(commonPrefixLength))
  const maxSegmentCount = Math.max(...relativeDirectorySegments.map((segments) => segments.length), 0)

  for (let segmentCount = 1; segmentCount <= maxSegmentCount; segmentCount++) {
    const candidates = relativeDirectorySegments.map((segments) => formatPathSuffix(segments, segmentCount))
    if (new Set(candidates).size === candidates.length) {
      return candidates
    }
  }

  return relativeDirectorySegments.map((segments) => segments.join('/'))
}

function getCommonPrefixLength(allSegments: string[][]): number {
  if (allSegments.length === 0) return 0

  let prefixLength = 0
  while (true) {
    const candidate = allSegments[0][prefixLength]
    if (!candidate) return prefixLength
    if (allSegments.some((segments) => segments[prefixLength] !== candidate)) {
      return prefixLength
    }
    prefixLength++
  }
}

function formatPathSuffix(segments: string[], segmentCount: number): string {
  if (segments.length === 0) return ''
  return segments.slice(-segmentCount).join('/')
}
