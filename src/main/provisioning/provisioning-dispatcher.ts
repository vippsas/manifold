import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { Project } from '../../shared/types'
import {
  PROVISIONER_PROTOCOL_VERSION,
  type ProvisionerConfig,
  type ProvisionerTemplate,
  type ProvisioningCreateRequest,
  type ProvisioningCreateResult,
  type ProvisioningProgressPayload,
  type ProvisioningReadyResult,
  type ProvisioningTemplateDescriptor,
} from '../../shared/provisioning-types'
import { runProvisionerRequest } from './provisioner-process'
import type { SettingsStore } from '../store/settings-store'
import type { ProjectRegistry } from '../store/project-registry'

const execFileAsync = promisify(execFile)

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    || 'new-project'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function validateCreateRequest(request: ProvisioningCreateRequest): void {
  if (!isRecord(request) || typeof request.templateQualifiedId !== 'string' || !request.templateQualifiedId.trim()) {
    throw new Error('A valid template selection is required')
  }
  if (!isRecord(request.inputs)) {
    throw new Error('Template inputs are required')
  }
}

function splitQualifiedId(qualifiedId: string): { provisionerId: string; templateId: string } {
  const index = qualifiedId.indexOf(':')
  if (index <= 0 || index === qualifiedId.length - 1) {
    throw new Error(`Invalid template identifier: ${qualifiedId}`)
  }
  return {
    provisionerId: qualifiedId.slice(0, index),
    templateId: qualifiedId.slice(index + 1),
  }
}

async function cloneProject(repoUrl: string, targetDir: string): Promise<void> {
  if (repoUrl.startsWith('-')) {
    throw new Error('Invalid repository source')
  }
  await execFileAsync('git', ['clone', '--', repoUrl, targetDir])
  if (path.isAbsolute(repoUrl) && existsSync(repoUrl)) {
    await execFileAsync('git', ['remote', 'remove', 'origin'], { cwd: targetDir }).catch(() => {})
  }
}

export class ProvisioningDispatcher {
  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly projectRegistry: ProjectRegistry,
  ) {}

  async listTemplates(fresh = false): Promise<ProvisioningTemplateDescriptor[]> {
    const provisioners = this.getEnabledProvisioners()
    const results = await Promise.all(
      provisioners.map(async (provisioner) => {
        try {
          const templates = await this.runProvisioner<ProvisionerTemplate[]>(
            provisioner,
            { protocolVersion: PROVISIONER_PROTOCOL_VERSION, operation: 'listTemplates', fresh },
          )
          return templates.map((template) => ({
            ...template,
            qualifiedId: `${provisioner.id}:${template.id}`,
            provisionerId: provisioner.id,
            provisionerLabel: provisioner.label,
            tags: template.tags ?? [],
          }))
        } catch (err) {
          console.error(`[provisioning] listTemplates failed for ${provisioner.id}:`, err)
          return []
        }
      }),
    )

    return results
      .flat()
      .sort((left, right) => {
        if (left.category !== right.category) return left.category.localeCompare(right.category)
        if (left.provisionerLabel !== right.provisionerLabel) return left.provisionerLabel.localeCompare(right.provisionerLabel)
        return left.title.localeCompare(right.title)
      })
  }

  async create(
    request: ProvisioningCreateRequest,
    onProgress?: (payload: ProvisioningProgressPayload) => void,
  ): Promise<ProvisioningCreateResult> {
    validateCreateRequest(request)

    const { provisionerId, templateId } = splitQualifiedId(request.templateQualifiedId)
    const provisioner = this.getEnabledProvisioners().find((entry) => entry.id === provisionerId)
    if (!provisioner) {
      throw new Error(`Provisioner not found or disabled: ${provisionerId}`)
    }

    const requestId = randomUUID()
    const created = await this.runProvisioner<ProvisioningReadyResult>(
      provisioner,
      {
        protocolVersion: PROVISIONER_PROTOCOL_VERSION,
        operation: 'create',
        requestId,
        templateId,
        inputs: request.inputs,
      },
      (message) => onProgress?.({ requestId, message, templateQualifiedId: request.templateQualifiedId }),
    )

    onProgress?.({ requestId, message: 'Cloning repository into managed storage...', templateQualifiedId: request.templateQualifiedId })
    const project = await this.materializeProject(created)
    onProgress?.({ requestId, message: 'Project ready.', templateQualifiedId: request.templateQualifiedId })

    return {
      requestId,
      templateQualifiedId: request.templateQualifiedId,
      project: {
        id: project.id,
        path: project.path,
        name: project.name,
        baseBranch: project.baseBranch,
      },
      metadata: created.metadata,
    }
  }

  private getEnabledProvisioners(): ProvisionerConfig[] {
    const settings = this.settingsStore.getSettings()
    return (settings.provisioning?.provisioners ?? []).filter((provisioner) => provisioner.enabled !== false)
  }

  private async runProvisioner<T>(
    provisioner: ProvisionerConfig,
    request: Parameters<typeof runProvisionerRequest<T>>[2],
    onProgress?: (message: string) => void,
  ): Promise<T> {
    const { command, args } = this.resolveProvisionerCommand(provisioner)
    return await runProvisionerRequest<T>(command, args, request, onProgress)
  }

  private resolveProvisionerCommand(provisioner: ProvisionerConfig): { command: string; args: string[] } {
    if (provisioner.type === 'builtin') {
      if (provisioner.id !== 'oss-bundled') {
        throw new Error(`Unknown builtin provisioner: ${provisioner.id}`)
      }
      return {
        command: process.execPath,
        args: [path.join(__dirname, 'oss-provisioner.js')],
      }
    }

    if (!provisioner.command) {
      throw new Error(`Provisioner command is required for ${provisioner.id}`)
    }

    return {
      command: provisioner.command,
      args: provisioner.args ?? [],
    }
  }

  private async materializeProject(result: ProvisioningReadyResult): Promise<Project> {
    const settings = this.settingsStore.getSettings()
    const projectsBase = path.join(settings.storagePath, 'projects')
    mkdirSync(projectsBase, { recursive: true })
    const baseSlug = slugify(result.displayName)
    let slug = baseSlug
    let projectDir = path.join(projectsBase, slug)
    let suffix = 2

    while (existsSync(projectDir)) {
      slug = `${baseSlug}-${suffix}`
      projectDir = path.join(projectsBase, slug)
      suffix++
    }

    try {
      await cloneProject(result.repoUrl, projectDir)
      return await this.projectRegistry.addProject(projectDir)
    } catch (err) {
      try { rmSync(projectDir, { recursive: true, force: true }) } catch { /* best effort */ }
      throw err
    }
  }
}
