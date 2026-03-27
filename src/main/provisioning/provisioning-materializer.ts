import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Project } from '../../shared/types'
import type { ProvisioningReadyResult } from '../../shared/provisioning-types'
import { ProvisioningError } from './provisioning-errors'
import type { ProjectRegistry } from '../store/project-registry'
import { debugLog } from '../app/debug-log'

const execFileAsync = promisify(execFile)

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'new-project'
}

function sshToHttps(repoUrl: string): string | null {
  const match = repoUrl.match(/^git@github\.com:([^/]+\/[^/.]+?)(?:\.git)?$/)
  return match ? `https://github.com/${match[1]}.git` : null
}

async function cloneWithGh(fullName: string, targetDir: string): Promise<void> {
  debugLog(`[provisioning] cloning with gh: ${fullName} → ${targetDir}`)
  await execFileAsync('gh', ['repo', 'clone', fullName, targetDir], {
    env: { ...process.env, GH_NO_UPDATE_NOTIFIER: '1' },
  })
  debugLog(`[provisioning] gh clone succeeded`)
}

async function cloneWithGit(repoUrl: string, targetDir: string): Promise<void> {
  debugLog(`[provisioning] cloning with git (SSH): ${repoUrl}`)
  try {
    await execFileAsync('git', ['clone', '--', repoUrl, targetDir])
    if (path.isAbsolute(repoUrl) && existsSync(repoUrl)) {
      await execFileAsync('git', ['remote', 'remove', 'origin'], { cwd: targetDir }).catch(() => {})
    }
    debugLog(`[provisioning] git clone (SSH) succeeded`)
    return
  } catch (sshError) {
    debugLog(`[provisioning] git clone (SSH) failed: ${sshError instanceof Error ? sshError.message : sshError}`)
    const httpsUrl = sshToHttps(repoUrl)
    if (!httpsUrl) {
      throw new ProvisioningError('clone_failed', 'Failed to clone provisioned repository', {
        code: 'clone_failed',
        details: { repoUrl, reason: sshError instanceof Error ? sshError.message : String(sshError) },
      })
    }
    try {
      rmSync(targetDir, { recursive: true, force: true })
    } catch { /* best-effort cleanup before retry */ }
    debugLog(`[provisioning] retrying with HTTPS: ${httpsUrl}`)
    try {
      await execFileAsync('git', ['clone', '--', httpsUrl, targetDir])
      debugLog(`[provisioning] git clone (HTTPS) succeeded`)
    } catch (httpsError) {
      throw new ProvisioningError('clone_failed', 'Failed to clone provisioned repository', {
        code: 'clone_failed',
        details: { repoUrl, reason: httpsError instanceof Error ? httpsError.message : String(httpsError) },
      })
    }
  }
}

async function cloneProject(repoUrl: string, targetDir: string, githubFullName?: string): Promise<void> {
  if (repoUrl.startsWith('-')) {
    throw new ProvisioningError('clone_failed', 'Invalid repository source', {
      code: 'invalid_repository_source',
    })
  }

  // Prefer gh repo clone for GitHub repos — it uses gh's own auth which works
  // reliably even in packaged apps launched from Finder/Spotlight where SSH
  // agent keys may not be available.
  if (githubFullName) {
    try {
      await cloneWithGh(githubFullName, targetDir)
      return
    } catch (ghError) {
      debugLog(`[provisioning] gh clone failed, falling back to git: ${ghError instanceof Error ? ghError.message : ghError}`)
      try {
        rmSync(targetDir, { recursive: true, force: true })
      } catch { /* best-effort cleanup before retry */ }
    }
  }

  await cloneWithGit(repoUrl, targetDir)
}

export async function materializeProvisionedProject(
  projectsBase: string,
  projectRegistry: ProjectRegistry,
  result: ProvisioningReadyResult,
): Promise<Project> {
  mkdirSync(projectsBase, { recursive: true })

  const baseSlug = slugify(result.displayName)
  let slug = baseSlug
  let projectDir = path.join(projectsBase, slug)
  let suffix = 2

  while (existsSync(projectDir)) {
    slug = `${baseSlug}-${suffix}`
    projectDir = path.join(projectsBase, slug)
    suffix += 1
  }

  const githubFullName = typeof result.metadata?.githubFullName === 'string' ? result.metadata.githubFullName : undefined
  debugLog(`[provisioning] materializing: repoUrl=${result.repoUrl} fullName=${githubFullName ?? '(none)'} dir=${projectDir}`)

  try {
    await cloneProject(result.repoUrl, projectDir, githubFullName)
    return await projectRegistry.addProject(projectDir)
  } catch (error) {
    try {
      rmSync(projectDir, { recursive: true, force: true })
    } catch {
      // Best-effort cleanup.
    }

    if (error instanceof ProvisioningError) {
      throw error
    }
    throw new ProvisioningError('registration_failed', 'Failed to register provisioned project', {
      code: `registration_failed_${randomUUID()}`,
      details: { reason: error instanceof Error ? error.message : String(error) },
    })
  }
}
