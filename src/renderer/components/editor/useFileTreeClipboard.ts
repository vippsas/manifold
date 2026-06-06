import { useCallback, useState } from 'react'
import type { FileTreeNode } from '../../../shared/types'

export interface FileTreeClipboard {
  hasClipboard: boolean
  copy: (nodes: FileTreeNode[]) => void
  cut: (nodes: FileTreeNode[]) => void
  paste: (targetDir: string) => Promise<void>
}

/** In-renderer file clipboard. Copy reuses the import (copy-into-dir) path;
 *  cut reuses the move path and is consumed after a successful paste. */
export function useFileTreeClipboard(opts: {
  onImportPaths?: (dirPath: string, sourcePaths: string[]) => Promise<string | null>
  onMovePath?: (sourcePath: string, targetDir: string, options?: { overwrite?: boolean }) => Promise<string | null>
}): FileTreeClipboard {
  const [clip, setClip] = useState<{ paths: string[]; mode: 'copy' | 'cut' } | null>(null)

  const copy = useCallback((nodes: FileTreeNode[]): void => {
    if (nodes.length) setClip({ paths: nodes.map((n) => n.path), mode: 'copy' })
  }, [])

  const cut = useCallback((nodes: FileTreeNode[]): void => {
    if (nodes.length) setClip({ paths: nodes.map((n) => n.path), mode: 'cut' })
  }, [])

  const paste = useCallback(async (targetDir: string): Promise<void> => {
    if (!clip) return
    if (clip.mode === 'copy') {
      if (opts.onImportPaths) await opts.onImportPaths(targetDir, clip.paths)
    } else {
      if (opts.onMovePath) for (const p of clip.paths) await opts.onMovePath(p, targetDir)
      setClip(null)
    }
  }, [clip, opts])

  return { hasClipboard: clip !== null, copy, cut, paste }
}
