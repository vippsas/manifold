// resources/plugins/manifold.watch/src/webview/watch-state-equality.ts
// Ported verbatim from src/renderer/hooks/watch-state-equality.ts.
import type { WatchFrameRef } from '../shared-types'

export function sameStringMap(left: Record<number, string>, right: Record<number, string>): boolean {
  const leftEntries = Object.entries(left)
  const rightEntries = Object.entries(right)
  if (leftEntries.length !== rightEntries.length) return false
  return leftEntries.every(([key, value]) => right[Number(key)] === value)
}

export function sameFrameMap(left: Record<number, WatchFrameRef[]>, right: Record<number, WatchFrameRef[]>): boolean {
  const leftEntries = Object.entries(left)
  const rightEntries = Object.entries(right)
  if (leftEntries.length !== rightEntries.length) return false
  return leftEntries.every(([key, leftFrames]) => {
    const rightFrames = right[Number(key)]
    if (!rightFrames || rightFrames.length !== leftFrames.length) return false
    return leftFrames.every((frame, index) => {
      const other = rightFrames[index]
      return other &&
        other.path === frame.path &&
        other.hdPath === frame.hdPath &&
        other.timestampSeconds === frame.timestampSeconds
    })
  })
}
