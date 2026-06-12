import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ShellPromptSegments } from '../../shared/types'
import { writeFileAtomicSync } from '../store/atomic-write'

/**
 * Shared segment-toggle file sourced by every Manifold zsh prompt. The
 * generated .zshrc re-sources it whenever it changes (see shell-prompt.ts),
 * so prompt-segment settings apply to live shells without respawning them.
 * Lives next to config.json so all Manifold instances agree on it.
 */
export function shellPromptSegmentsFilePath(): string {
  return path.join(os.homedir(), '.manifold', 'shell-prompt-segments.zsh')
}

export function writeShellPromptSegmentsFile(
  segments: ShellPromptSegments,
  file: string = shellPromptSegmentsFilePath(),
): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const content = [
    `_manifold_seg_repo=${segments.repo ? 1 : 0}`,
    `_manifold_seg_agent=${segments.agent ? 1 : 0}`,
    `_manifold_seg_k8s_ctx=${segments.k8sContext ? 1 : 0}`,
    `_manifold_seg_k8s_ns=${segments.k8sNamespace ? 1 : 0}`,
    '',
  ].join('\n')
  // Atomic write gives the file a fresh inode, which the zsh-side stamp
  // (inode+mtime) detects even for same-second rewrites.
  writeFileAtomicSync(file, content)
}
