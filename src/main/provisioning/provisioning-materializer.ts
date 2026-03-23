import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { Project } from '../../shared/types'
import type { ProvisioningReadyResult } from '../../shared/provisioning-types'
import { ProvisioningError } from './provisioning-errors'
import type { ProjectRegistry } from '../store/project-registry'

const execFileAsync = promisify(execFile)

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'new-project'
}

async function cloneProject(repoUrl: string, targetDir: string): Promise<void> {
  if (repoUrl.startsWith('-')) {
    throw new ProvisioningError('clone_failed', 'Invalid repository source', {
      code: 'invalid_repository_source',
    })
  }

  try {
    await execFileAsync('git', ['clone', '--', repoUrl, targetDir])
    if (path.isAbsolute(repoUrl) && existsSync(repoUrl)) {
      await execFileAsync('git', ['remote', 'remove', 'origin'], { cwd: targetDir }).catch(() => {})
    }
  } catch (error) {
    throw new ProvisioningError('clone_failed', 'Failed to clone provisioned repository', {
      code: 'clone_failed',
      details: { repoUrl, reason: error instanceof Error ? error.message : String(error) },
    })
  }
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

  try {
    await cloneProject(result.repoUrl, projectDir)
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
