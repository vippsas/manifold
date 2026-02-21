import { writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const META_FILENAME = '.manifold.json'

export interface WorktreeMeta {
  runtimeId: string
  taskDescription?: string
}

export async function writeWorktreeMeta(
  worktreePath: string,
  meta: WorktreeMeta
): Promise<void> {
  await writeFile(join(worktreePath, META_FILENAME), JSON.stringify(meta), 'utf-8')
}

export async function readWorktreeMeta(
  worktreePath: string
): Promise<WorktreeMeta | null> {
  try {
    const raw = await readFile(join(worktreePath, META_FILENAME), 'utf-8')
    return JSON.parse(raw) as WorktreeMeta
  } catch {
    return null
  }
}
