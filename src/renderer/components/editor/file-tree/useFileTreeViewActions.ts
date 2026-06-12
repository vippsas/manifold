import { useCallback, useEffect } from 'react'
import type React from 'react'
import type { FileTreeNode } from '../../../../shared/types'

interface UseFileTreeViewActionsParams {
  tree: FileTreeNode | null
  additionalTrees?: Map<string, FileTreeNode>
  expandedPaths: Set<string>
  onToggleExpand: (path: string) => void
  activeFilePath: string | null
  containerRef: React.RefObject<HTMLDivElement | null>
}

/** Expansion + reveal operations for the file tree: expand-all, collapse-all,
 *  and auto-scrolling the active file's row into view when it changes. */
export function useFileTreeViewActions({
  tree, additionalTrees, expandedPaths, onToggleExpand, activeFilePath, containerRef,
}: UseFileTreeViewActionsParams): { handleExpandAll: () => void; handleCollapseAll: () => void } {
  const handleCollapseAll = useCallback((): void => {
    for (const p of Array.from(expandedPaths)) onToggleExpand(p)
  }, [expandedPaths, onToggleExpand])

  const handleExpandAll = useCallback((): void => {
    const walk = (n: FileTreeNode): void => {
      if (!n.isDirectory) return
      if (!expandedPaths.has(n.path)) onToggleExpand(n.path)
      n.children?.forEach(walk)
    }
    if (tree) walk(tree)
    additionalTrees?.forEach(walk)
  }, [tree, additionalTrees, expandedPaths, onToggleExpand])

  // Auto-reveal: scroll the active file's row into view when it changes.
  useEffect(() => {
    if (!activeFilePath) return
    const raf = requestAnimationFrame(() => {
      const rows = containerRef.current?.querySelectorAll<HTMLElement>('[data-tree-path]')
      if (!rows) return
      for (const row of rows) {
        if (row.dataset.treePath === activeFilePath) {
          if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' })
          break
        }
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [activeFilePath, containerRef])

  return { handleExpandAll, handleCollapseAll }
}
