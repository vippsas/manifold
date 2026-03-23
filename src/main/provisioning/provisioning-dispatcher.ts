import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type {
  ProvisionerConfig,
  ProvisionerStatus,
  ProvisionerTemplate,
  ProvisioningCreateRequest,
  ProvisioningCreateResult,
  ProvisioningOperationResult,
  ProvisioningProgressPayload,
  ProvisioningReadyResult,
  ProvisioningTemplateCatalog,
  ProvisioningTemplateDescriptor,
} from '../../shared/provisioning-types'
import { PROVISIONER_PROTOCOL_VERSION } from '../../shared/provisioning-types'
import { decodeProvisioningTemplateQualifiedId, encodeProvisioningTemplateQualifiedId } from '../../shared/provisioning-qualified-id'
import { runProvisionerRequest } from './provisioner-process'
import { resolveProvisionerCommand } from './provisioner-command'
import { ProvisioningCatalogCache } from './provisioning-catalog-cache'
import { ProvisioningError, toProvisioningErrorDescriptor } from './provisioning-errors'
import { materializeProvisionedProject } from './provisioning-materializer'
import { checkProvisionerHealth } from './provisioning-health'
import type { SettingsStore } from '../store/settings-store'
import type { ProjectRegistry } from '../store/project-registry'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function validateCreateRequest(request: ProvisioningCreateRequest): void {
  if (!isRecord(request) || typeof request.templateQualifiedId !== 'string' || !request.templateQualifiedId.trim()) {
    throw new ProvisioningError('template_not_found', 'A valid template selection is required', {
      code: 'invalid_template_selection',
    })
  }
  if (!isRecord(request.inputs)) {
    throw new ProvisioningError('settings_invalid', 'Template inputs are required', {
      code: 'missing_template_inputs',
    })
  }
}

function splitQualifiedId(qualifiedId: string): { provisionerId: string; templateId: string } {
  const decoded = decodeProvisioningTemplateQualifiedId(qualifiedId)
  if (!decoded) {
    throw new ProvisioningError('template_not_found', `Invalid template identifier: ${qualifiedId}`, {
      code: 'invalid_template_identifier',
    })
  }
  return decoded
}

function sortTemplates(templates: ProvisioningTemplateDescriptor[]): ProvisioningTemplateDescriptor[] {
  return templates.sort((left, right) => {
    if (left.category !== right.category) return left.category.localeCompare(right.category)
    if (left.provisionerLabel !== right.provisionerLabel) return left.provisionerLabel.localeCompare(right.provisionerLabel)
    return left.title.localeCompare(right.title)
  })
}

function normalizeState(errorCategory?: string): ProvisionerStatus['state'] {
  if (errorCategory === 'settings_invalid') return 'misconfigured'
  if (errorCategory === 'provisioner_unavailable' || errorCategory === 'health_check_failed') return 'unreachable'
  return 'degraded'
}

export class ProvisioningDispatcher {
  constructor(
    private readonly settingsStore: SettingsStore,
    private readonly projectRegistry: ProjectRegistry,
  ) {}

  async listTemplates(fresh = false, provisionerId?: string): Promise<ProvisioningTemplateCatalog> {
    const provisioners = this.getEnabledProvisioners(provisionerId)
    const results = await Promise.all(provisioners.map(async (provisioner) => await this.loadProvisionerCatalog(provisioner, fresh)))

    return {
      templates: sortTemplates(results.flatMap((entry) => entry.templates)),
      provisioners: results.map((entry) => entry.status).sort((left, right) => left.provisionerLabel.localeCompare(right.provisionerLabel)),
    }
  }

  async getProvisionerStatuses(): Promise<ProvisionerStatus[]> {
    return this.getEnabledProvisioners()
      .map((provisioner) => this.getCachedStatus(provisioner))
      .sort((left, right) => left.provisionerLabel.localeCompare(right.provisionerLabel))
  }

  async checkHealth(provisionerId?: string): Promise<ProvisionerStatus[]> {
    const results = await Promise.all(this.getEnabledProvisioners(provisionerId).map(async (provisioner) => {
      const health = await checkProvisionerHealth(provisioner)
      const cached = this.getCache().get(provisioner)
      const status: ProvisionerStatus = {
        ...health,
        source: cached ? 'cache' : 'none',
        templateCount: cached?.templates.length ?? 0,
        lastFetchedAt: cached?.fetchedAt,
        isStale: cached ? this.getCache().isStale(cached) : false,
      }
      this.getCache().updateStatus(provisioner, status)
      return status
    }))
    return results.sort((left, right) => left.provisionerLabel.localeCompare(right.provisionerLabel))
  }

  async create(
    request: ProvisioningCreateRequest,
    onProgress?: (payload: ProvisioningProgressPayload) => void,
  ): Promise<ProvisioningOperationResult<ProvisioningCreateResult>> {
    try {
      validateCreateRequest(request)
      const { provisionerId, templateId } = splitQualifiedId(request.templateQualifiedId)
      const provisioner = this.getEnabledProvisioners().find((entry) => entry.id === provisionerId)
      if (!provisioner) {
        throw new ProvisioningError('template_not_found', `Provisioner not found or disabled: ${provisionerId}`, {
          code: 'provisioner_not_found',
        })
      }

      const requestId = randomUUID()
      const created = await this.runProvisioner<ProvisioningReadyResult>(
        provisioner,
        { protocolVersion: PROVISIONER_PROTOCOL_VERSION, operation: 'create', requestId, templateId, inputs: request.inputs },
        (payload) => onProgress?.({ ...payload, requestId, templateQualifiedId: request.templateQualifiedId }),
      )

      onProgress?.({ requestId, templateQualifiedId: request.templateQualifiedId, message: 'Cloning repository into managed storage...', stage: 'cloning', status: 'running' })
      const projectsBase = path.join(this.settingsStore.getSettings().storagePath, 'projects')
      const project = await materializeProvisionedProject(projectsBase, this.projectRegistry, created)
      onProgress?.({ requestId, templateQualifiedId: request.templateQualifiedId, message: 'Project ready.', stage: 'ready', status: 'done', percent: 100 })

      return {
        ok: true,
        value: {
          requestId,
          templateQualifiedId: request.templateQualifiedId,
          project: { id: project.id, path: project.path, name: project.name, baseBranch: project.baseBranch },
          metadata: created.metadata,
        },
      }
    } catch (error) {
      return {
        ok: false,
        error: toProvisioningErrorDescriptor(error, error instanceof ProvisioningError ? error.descriptor.category : 'create_failed'),
      }
    }
  }

  private async loadProvisionerCatalog(
    provisioner: ProvisionerConfig,
    fresh: boolean,
  ): Promise<{ templates: ProvisioningTemplateDescriptor[]; status: ProvisionerStatus }> {
    const cache = this.getCache()
    const cached = cache.get(provisioner)
    const canUseCache = Boolean(cached) && !fresh && !cache.isStale(cached)

    if (canUseCache && cached) {
      return this.catalogFromCache(provisioner, cached, false)
    }

    try {
      const templates = await this.runProvisioner<ProvisionerTemplate[]>(
        provisioner,
        { protocolVersion: PROVISIONER_PROTOCOL_VERSION, operation: 'listTemplates', fresh },
      )
      const fetchedAt = new Date()
      const status: ProvisionerStatus = {
        provisionerId: provisioner.id,
        provisionerLabel: provisioner.label,
        enabled: provisioner.enabled,
        source: 'live',
        state: 'healthy',
        templateCount: templates.length,
        lastFetchedAt: fetchedAt.toISOString(),
        checkedAt: fetchedAt.toISOString(),
        summary: `Fetched ${templates.length} template${templates.length === 1 ? '' : 's'}`,
      }
      cache.write(provisioner, templates, status, fetchedAt)
      return this.catalogFromTemplates(provisioner, templates, status, 'live', false, fetchedAt.toISOString())
    } catch (error) {
      const descriptor = toProvisioningErrorDescriptor(error, 'template_catalog_failed')
      if (cached) {
        const fallback = this.catalogFromCache(provisioner, cached, true)
        fallback.status.error = descriptor
        fallback.status.state = normalizeState(descriptor.category)
        fallback.status.summary = `Using cached templates: ${descriptor.message}`
        return fallback
      }
      return {
        templates: [],
        status: {
          provisionerId: provisioner.id,
          provisionerLabel: provisioner.label,
          enabled: provisioner.enabled,
          source: 'none',
          state: normalizeState(descriptor.category),
          templateCount: 0,
          summary: descriptor.message,
          error: descriptor,
        },
      }
    }
  }

  private catalogFromCache(
    provisioner: ProvisionerConfig,
    cached: NonNullable<ReturnType<ProvisioningCatalogCache['get']>>,
    stale: boolean,
  ): { templates: ProvisioningTemplateDescriptor[]; status: ProvisionerStatus } {
    const status: ProvisionerStatus = {
      provisionerId: provisioner.id,
      provisionerLabel: provisioner.label,
      enabled: provisioner.enabled,
      source: 'cache',
      state: cached.status?.state ?? (stale ? 'degraded' : 'healthy'),
      templateCount: cached.templates.length,
      checkedAt: cached.status?.checkedAt,
      lastFetchedAt: cached.fetchedAt,
      isStale: stale,
      summary: cached.status?.summary ?? (stale ? 'Using stale cached templates' : 'Using cached templates'),
      version: cached.status?.version,
      capabilities: cached.status?.capabilities,
      error: cached.status?.error,
    }
    return this.catalogFromTemplates(provisioner, cached.templates, status, 'cache', stale, cached.fetchedAt)
  }

  private catalogFromTemplates(
    provisioner: ProvisionerConfig,
    templates: ProvisionerTemplate[],
    status: ProvisionerStatus,
    source: ProvisioningTemplateDescriptor['catalogSource'],
    stale: boolean,
    fetchedAt?: string,
  ): { templates: ProvisioningTemplateDescriptor[]; status: ProvisionerStatus } {
    return {
      templates: templates.map((template) => ({
        ...template,
        qualifiedId: encodeProvisioningTemplateQualifiedId(provisioner.id, template.id),
        provisionerId: provisioner.id,
        provisionerLabel: provisioner.label,
        tags: template.tags ?? [],
        catalogSource: source,
        isStale: stale,
        lastFetchedAt: fetchedAt,
        provisionerState: status.state,
      })),
      status,
    }
  }

  private getEnabledProvisioners(provisionerId?: string): ProvisionerConfig[] {
    return (this.settingsStore.getSettings().provisioning?.provisioners ?? [])
      .filter((provisioner) => provisioner.enabled !== false)
      .filter((provisioner) => !provisionerId || provisioner.id === provisionerId)
  }

  private getCachedStatus(provisioner: ProvisionerConfig): ProvisionerStatus {
    const cached = this.getCache().get(provisioner)
    if (!cached) {
      return {
        provisionerId: provisioner.id,
        provisionerLabel: provisioner.label,
        enabled: provisioner.enabled,
        source: 'none',
        state: 'unknown',
        templateCount: 0,
        summary: 'No cached catalog or health data yet',
      }
    }
    return this.catalogFromCache(provisioner, cached, this.getCache().isStale(cached)).status
  }

  private async runProvisioner<T>(
    provisioner: ProvisionerConfig,
    request: Parameters<typeof runProvisionerRequest<T>>[2],
    onProgress?: (payload: ProvisioningProgressPayload) => void,
  ): Promise<T> {
    const { command, args } = resolveProvisionerCommand(provisioner)
    return await runProvisionerRequest<T>(command, args, request, onProgress)
  }

  private getCache(): ProvisioningCatalogCache {
    const cacheFile = path.join(this.settingsStore.getSettings().storagePath, '.cache', 'provisioning-catalog.json')
    return new ProvisioningCatalogCache(cacheFile)
  }
}
