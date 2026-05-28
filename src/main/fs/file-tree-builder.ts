import * as fs from 'node:fs'
import * as path from 'node:path'
import { FileTreeNode } from '../../shared/types'
import { isVisibleEntry, directoriesFirstComparator } from './file-watcher-utils'

/** Recursively build a FileTreeNode for a directory, hidden entries filtered. */
export function buildFileTree(dirPath: string): FileTreeNode {
  return buildTree(dirPath, path.basename(dirPath))
}

function buildTree(fullPath: string, name: string): FileTreeNode {
  let stat: fs.Stats
  try {
    stat = fs.statSync(fullPath)
  } catch {
    return { name, path: fullPath, isDirectory: false }
  }

  if (!stat.isDirectory()) {
    return { name, path: fullPath, isDirectory: false }
  }

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(fullPath, { withFileTypes: true })
  } catch {
    return { name, path: fullPath, isDirectory: true, children: [] }
  }

  const children = buildChildren(fullPath, entries)
  return { name, path: fullPath, isDirectory: true, children }
}

function buildChildren(parentPath: string, entries: fs.Dirent[]): FileTreeNode[] {
  return entries
    .filter(isVisibleEntry)
    .sort(directoriesFirstComparator)
    .map((entry) => buildTree(path.join(parentPath, entry.name), entry.name))
}
