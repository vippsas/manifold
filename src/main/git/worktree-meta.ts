import { writeFile, readFile, unlink } from 'node:fs/promises'

export interface WorktreeMeta {
  runtimeId: string
  taskDescription?: string
  additionalDirs?: string[]
  ollamaModel?: string
}

/** Meta file stored as a sibling to the worktree directory, not inside it. */
function metaPath(worktreePath: string): string {
  return worktreePath + '.manifold.json'
}

export async function writeWorktreeMeta(
  worktreePath: string,
  meta: WorktreeMeta
): Promise<void> {
  await writeFile(metaPath(worktreePath), JSON.stringify(meta), 'utf-8')
}

export async function readWorktreeMeta(
  worktreePath: string
): Promise<WorktreeMeta | null> {
  try {
    const raw = await readFile(metaPath(worktreePath), 'utf-8')
    return JSON.parse(raw) as WorktreeMeta
  } catch {
    return null
  }
}

export async function removeWorktreeMeta(worktreePath: string): Promise<void> {
  try {
    await unlink(metaPath(worktreePath))
  } catch {
    // File may not exist; ignore
  }
}
