import type { FileChange } from '../../../shared/types'

/** A directory in the Source Control tree. `label` is the compressed segment
 *  chain VS Code shows — a directory whose only child is another directory
 *  renders as `src/components/git` on one row rather than three. `path` is the
 *  full prefix, which stays stable under compression and so makes a usable key. */
export interface ScmTreeDir {
  kind: 'dir'
  label: string
  path: string
  children: ScmTreeNode[]
}

export interface ScmTreeFile {
  kind: 'file'
  change: FileChange
}

export type ScmTreeNode = ScmTreeDir | ScmTreeFile

interface MutableDir {
  dirs: Map<string, MutableDir>
  files: FileChange[]
}

function emptyDir(): MutableDir {
  return { dirs: new Map(), files: [] }
}

/** Directories before files, each alphabetical — the tree's own ordering, which
 *  replaces the flat list's group-by-change-type sort. */
function compare(a: ScmTreeNode, b: ScmTreeNode): number {
  if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1
  if (a.kind === 'dir' && b.kind === 'dir') return a.label.localeCompare(b.label)
  const aFile = a as ScmTreeFile
  const bFile = b as ScmTreeFile
  return aFile.change.path.localeCompare(bFile.change.path)
}

function toNodes(dir: MutableDir, prefix: string): ScmTreeNode[] {
  const nodes: ScmTreeNode[] = []

  for (const [name, child] of dir.dirs) {
    const path = prefix ? `${prefix}/${name}` : name
    let label = name
    let node = child
    let nodePath = path
    // Compress a chain of single-child directories into one row. A directory
    // that also holds files is a real branch point and stops the chain.
    while (node.files.length === 0 && node.dirs.size === 1) {
      const [nextName, nextChild] = [...node.dirs][0]
      label = `${label}/${nextName}`
      nodePath = `${nodePath}/${nextName}`
      node = nextChild
    }
    nodes.push({ kind: 'dir', label, path: nodePath, children: toNodes(node, nodePath) })
  }

  for (const change of dir.files) {
    nodes.push({ kind: 'file', change })
  }

  return nodes.sort(compare)
}

/** Fold a group's flat change list into the nested shape VS Code's tree view
 *  renders. Files at the checkout root come back as top-level file nodes. */
export function buildScmTree(changes: FileChange[]): ScmTreeNode[] {
  const root = emptyDir()

  for (const change of changes) {
    const segments = change.path.split('/')
    const filename = segments.pop()
    if (!filename) continue
    let cursor = root
    for (const segment of segments) {
      let next = cursor.dirs.get(segment)
      if (!next) {
        next = emptyDir()
        cursor.dirs.set(segment, next)
      }
      cursor = next
    }
    cursor.files.push(change)
  }

  return toNodes(root, '')
}

/** Every file path under a node — what a directory row's stage/discard acts on. */
export function pathsUnder(node: ScmTreeNode): string[] {
  if (node.kind === 'file') return [node.change.path]
  return node.children.flatMap(pathsUnder)
}
