import { useCallback, useMemo, useRef } from 'react'
import type React from 'react'
import type { FileTreeNode } from '../../../shared/types'
import type { VisibleNode } from './file-tree-visible'
import type { FileTreeSelectionState } from './useFileTreeSelection'

interface UseFileTreeKeyboardParams {
  visibleNodes: VisibleNode[]
  selection: FileTreeSelectionState
  expandedPaths: Set<string>
  containerRef: React.RefObject<HTMLDivElement | null>
  onToggleExpand: (path: string) => void
  onOpenFile: (path: string) => void
  onRename?: (node: FileTreeNode) => void
  onDelete?: (nodes: FileTreeNode[]) => void
  onCopy?: (nodes: FileTreeNode[]) => void
  onCut?: (nodes: FileTreeNode[]) => void
  onPaste?: () => void
}

/** Move DOM focus to the row for `path` and scroll it into view, without
 *  hijacking the scroll position of the whole tree. */
function focusRow(container: HTMLDivElement | null, path: string): void {
  if (!container) return
  const rows = container.querySelectorAll<HTMLElement>('[data-tree-path]')
  for (const row of rows) {
    if (row.dataset.treePath === path) {
      row.focus({ preventScroll: true })
      if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' })
      return
    }
  }
}

export function useFileTreeKeyboard(params: UseFileTreeKeyboardParams): {
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
} {
  const { visibleNodes, selection, expandedPaths, containerRef } = params
  const typeAheadRef = useRef<{ buffer: string; time: number }>({ buffer: '', time: 0 })

  const order = useMemo(() => visibleNodes.map((v) => v.node.path), [visibleNodes])
  const byPath = useMemo(() => {
    const map = new Map<string, VisibleNode>()
    for (const v of visibleNodes) map.set(v.node.path, v)
    return map
  }, [visibleNodes])

  const moveTo = useCallback((path: string | undefined, extend: boolean): void => {
    if (!path) return
    if (extend) selection.rangeSelectTo(path, order)
    else selection.selectOnly(path)
    focusRow(containerRef.current, path)
  }, [order, selection, containerRef])

  const resolveSelectedNodes = useCallback((fallback: VisibleNode | undefined): FileTreeNode[] => {
    const nodes: FileTreeNode[] = []
    for (const path of selection.selectedPaths) {
      const v = byPath.get(path)
      if (v) nodes.push(v.node)
    }
    if (nodes.length) return nodes
    return fallback ? [fallback.node] : []
  }, [selection.selectedPaths, byPath])

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!visibleNodes.length) return
    const mod = e.metaKey || e.ctrlKey
    const cursor = selection.cursorPath
    const idx = cursor ? order.indexOf(cursor) : -1
    const current = cursor ? byPath.get(cursor) : undefined

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        moveTo(idx < 0 ? order[0] : order[Math.min(idx + 1, order.length - 1)], e.shiftKey)
        return
      case 'ArrowUp':
        e.preventDefault()
        moveTo(idx <= 0 ? order[0] : order[idx - 1], e.shiftKey)
        return
      case 'Home':
        e.preventDefault()
        moveTo(order[0], e.shiftKey)
        return
      case 'End':
        e.preventDefault()
        moveTo(order[order.length - 1], e.shiftKey)
        return
      case 'ArrowRight':
        if (!current) return
        e.preventDefault()
        if (current.node.isDirectory && !expandedPaths.has(current.node.path)) {
          params.onToggleExpand(current.node.path)
        } else if (current.node.isDirectory) {
          moveTo(order[idx + 1], false)
        }
        return
      case 'ArrowLeft':
        if (!current) return
        e.preventDefault()
        if (current.node.isDirectory && expandedPaths.has(current.node.path)) {
          params.onToggleExpand(current.node.path)
        } else if (current.parentPath) {
          moveTo(current.parentPath, false)
        }
        return
      case 'Enter':
        if (!current) return
        e.preventDefault()
        if (current.node.isDirectory) params.onToggleExpand(current.node.path)
        else params.onOpenFile(current.node.path)
        return
      case 'F2':
        if (current && params.onRename) { e.preventDefault(); params.onRename(current.node) }
        return
      case 'Delete':
        if (params.onDelete) { e.preventDefault(); params.onDelete(resolveSelectedNodes(current)) }
        return
      case 'Backspace':
        if (mod && params.onDelete) { e.preventDefault(); params.onDelete(resolveSelectedNodes(current)) }
        return
    }

    if (mod && params.onCopy && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); params.onCopy(resolveSelectedNodes(current)); return }
    if (mod && params.onCut && (e.key === 'x' || e.key === 'X')) { e.preventDefault(); params.onCut(resolveSelectedNodes(current)); return }
    if (mod && params.onPaste && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); params.onPaste(); return }

    // Type-ahead: jump to the next row whose name starts with the typed prefix.
    if (!mod && !e.altKey && e.key.length === 1 && /\S/.test(e.key)) {
      const now = Date.now()
      const ta = typeAheadRef.current
      ta.buffer = now - ta.time > 700 ? e.key : ta.buffer + e.key
      ta.time = now
      const prefix = ta.buffer.toLowerCase()
      const start = idx < 0 ? 0 : idx + (ta.buffer.length === 1 ? 1 : 0)
      for (let i = 0; i < order.length; i += 1) {
        const v = byPath.get(order[(start + i) % order.length])
        if (v && v.node.name.toLowerCase().startsWith(prefix)) {
          moveTo(v.node.path, false)
          return
        }
      }
    }
  }, [visibleNodes, selection, order, byPath, expandedPaths, moveTo, resolveSelectedNodes, params])

  return { onKeyDown }
}
