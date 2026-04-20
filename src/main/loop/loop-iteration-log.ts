import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { createHash } from 'node:crypto'
import type { LoopIteration } from '../../shared/loop-types'

function userLoopLogDir(): string {
  return path.join(os.homedir(), '.manifold', 'loop-logs')
}

function worktreeKey(worktreePath: string): string {
  return createHash('sha256').update(worktreePath).digest('hex').slice(0, 16)
}

export function iterationLogPath(worktreePath: string): string {
  return path.join(userLoopLogDir(), `${worktreeKey(worktreePath)}.jsonl`)
}

export async function appendIteration(worktreePath: string, iter: LoopIteration): Promise<void> {
  const logPath = iterationLogPath(worktreePath)
  await fs.mkdir(path.dirname(logPath), { recursive: true })
  await fs.appendFile(logPath, JSON.stringify(iter) + '\n', 'utf8')
}

export async function readAllIterations(worktreePath: string): Promise<LoopIteration[]> {
  const logPath = iterationLogPath(worktreePath)
  let content: string
  try {
    content = await fs.readFile(logPath, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  const iters: LoopIteration[] = []
  for (const line of content.split('\n')) {
    if (!line.trim()) continue
    try {
      iters.push(JSON.parse(line) as LoopIteration)
    } catch {
      // Skip malformed lines (partial writes, manual edits)
    }
  }
  return iters
}
