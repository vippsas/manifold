import * as fsp from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import * as path from 'node:path'
import { FileTreeNode } from '../../shared/types'
import { isVisibleEntry, directoriesFirstComparator } from './file-watcher-utils'

/** Recursively build a FileTreeNode for a directory, hidden entries filtered.
 *
 *  Asynchronous on purpose: the walk runs in the main process, where a
 *  synchronous one holds the event loop for its whole duration — and every
 *  agent switch (plus every debounced file change) triggers one. That block is
 *  what put the macOS spinner over the window: the readdir/stat syscalls cost
 *  milliseconds each on a machine with filesystem monitoring, so a checkout of
 *  a few thousand entries froze the app for hundreds of milliseconds and a
 *  large one for tens of seconds. */
export async function buildFileTree(dirPath: string): Promise<FileTreeNode> {
  return buildTree(dirPath, path.basename(dirPath), await isDirectory(dirPath))
}

async function buildTree(fullPath: string, name: string, isDir: boolean): Promise<FileTreeNode> {
  if (!isDir) return { name, path: fullPath, isDirectory: false }

  let entries: Dirent[]
  try {
    entries = await fsp.readdir(fullPath, { withFileTypes: true })
  } catch {
    return { name, path: fullPath, isDirectory: true, children: [] }
  }

  const children = await buildChildren(fullPath, entries)
  return { name, path: fullPath, isDirectory: true, children }
}

function buildChildren(parentPath: string, entries: Dirent[]): Promise<FileTreeNode[]> {
  return Promise.all(
    entries
      .filter(isVisibleEntry)
      .sort(directoriesFirstComparator)
      .map(async (entry) => {
        const fullPath = path.join(parentPath, entry.name)
        // The Dirent already says whether it is a directory; only a symlink
        // needs a stat, which resolves it the way the previous statSync walk
        // did — a symlinked folder is still browsed as a folder, and the ones
        // that matter for speed (node_modules) are cut by isVisibleEntry first.
        const isDir = entry.isDirectory()
          || (entry.isSymbolicLink() && await isDirectory(fullPath))
        return buildTree(fullPath, entry.name, isDir)
      }),
  )
}

async function isDirectory(fullPath: string): Promise<boolean> {
  try {
    return (await fsp.stat(fullPath)).isDirectory()
  } catch {
    return false
  }
}
