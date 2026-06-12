import type { FileTreeNode } from '../../../../shared/types'
import { sortChildren } from './tree-node-row'

/** A node as it appears in the rendered, flattened tree (visual order). */
export interface VisibleNode {
  node: FileTreeNode
  depth: number
  parentPath: string | null
}

/** Walk a single root node into visual order, descending into expanded dirs. */
export function flattenVisible(
  node: FileTreeNode,
  expandedPaths: Set<string>,
  depth = 0,
  parentPath: string | null = null,
  out: VisibleNode[] = [],
): VisibleNode[] {
  out.push({ node, depth, parentPath })
  if (node.isDirectory && expandedPaths.has(node.path) && node.children) {
    for (const child of sortChildren(node.children)) {
      flattenVisible(child, expandedPaths, depth + 1, node.path, out)
    }
  }
  return out
}

/** Build the full visible-row list across primary + additional roots, mirroring
 *  FileTree's render branches so keyboard navigation matches what's on screen. */
export function buildVisibleNodes(opts: {
  primary: FileTreeNode | null
  additional?: Map<string, FileTreeNode>
  flattenRoots: boolean
  hasHeaderedRoots: boolean
  expandedPaths: Set<string>
}): VisibleNode[] {
  const { primary, additional, flattenRoots, hasHeaderedRoots, expandedPaths } = opts
  const out: VisibleNode[] = []
  if (!primary) return out

  const pushRoot = (root: FileTreeNode): void => {
    if (hasHeaderedRoots && flattenRoots && root.isDirectory && root.children?.length) {
      for (const child of sortChildren(root.children)) flattenVisible(child, expandedPaths, 0, root.path, out)
    } else {
      flattenVisible(root, expandedPaths, 0, null, out)
    }
  }

  pushRoot(primary)
  if (additional) for (const root of additional.values()) pushRoot(root)
  return out
}

/** Case-insensitive subsequence match. Returns matched character indices in
 *  `text`, or null when `query` is not a subsequence. Empty query matches all. */
export function fuzzyMatch(text: string, query: string): number[] | null {
  if (!query) return []
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  const indices: number[] = []
  let ti = 0
  for (let qi = 0; qi < q.length; qi += 1) {
    const ch = q[qi]
    let found = -1
    while (ti < t.length) {
      if (t[ti] === ch) { found = ti; ti += 1; break }
      ti += 1
    }
    if (found === -1) return null
    indices.push(found)
  }
  return indices
}
