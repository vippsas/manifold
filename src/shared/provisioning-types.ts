export const PROVISIONER_PROTOCOL_VERSION = 1

export type ProvisionerKind = 'builtin' | 'cli'
export type TemplateInputValue = string | boolean | number
export type TemplateFieldType = 'string' | 'boolean' | 'integer' | 'number'
export type TemplateCatalogSource = 'live' | 'cache' | 'none'
export type ProvisionerHealthState = 'unknown' | 'healthy' | 'degraded' | 'unreachable' | 'misconfigured'
export type ProvisioningErrorCategory =
  | 'provisioner_unavailable'
  | 'protocol_error'
  | 'health_check_failed'
  | 'template_catalog_failed'
  | 'template_not_found'
  | 'create_failed'
  | 'clone_failed'
  | 'registration_failed'
  | 'settings_invalid'

export interface ProvisionerConfig {
  id: string
  label: string
  type: ProvisionerKind
  enabled: boolean
  command?: string
  args?: string[]
}

export interface ProvisioningSettings {
  provisioners: ProvisionerConfig[]
}

export interface TemplateFieldOption {
  value: string
  label: string
}

export interface TemplateFieldSchema {
  type: TemplateFieldType
  title?: string
  description?: string
  default?: TemplateInputValue
  placeholder?: string
  multiline?: boolean
  enum?: TemplateFieldOption[]
  minimum?: number
  maximum?: number
  step?: number
}

export interface TemplateInputSchema {
  type: 'object'
  properties: Record<string, TemplateFieldSchema>
  required?: string[]
}

export interface ProvisionerTemplate {
  id: string
  title: string
  description: string
  category: string
  tags?: string[]
  paramsSchema: TemplateInputSchema
  promptInstructions?: string
}

export interface ProvisioningErrorDescriptor {
  category: ProvisioningErrorCategory
  code: string
  message: string
  retryable: boolean
  details?: Record<string, string>
}

export interface ProvisionerHealthResult {
  healthy: boolean
  summary?: string
  checkedAt?: string
  version?: string
  capabilities?: string[]
}

export interface ProvisionerStatus {
  provisionerId: string
  provisionerLabel: string
  enabled: boolean
  source: TemplateCatalogSource
  state: ProvisionerHealthState
  templateCount: number
  checkedAt?: string
  lastFetchedAt?: string
  isStale?: boolean
  summary?: string
  version?: string
  capabilities?: string[]
  error?: ProvisioningErrorDescriptor
}

export interface ProvisioningTemplateDescriptor extends ProvisionerTemplate {
  qualifiedId: string
  provisionerId: string
  provisionerLabel: string
  catalogSource: Exclude<TemplateCatalogSource, 'none'>
  isStale?: boolean
  lastFetchedAt?: string
  provisionerState?: ProvisionerHealthState
}

export interface ProvisioningTemplateCatalog {
  templates: ProvisioningTemplateDescriptor[]
  provisioners: ProvisionerStatus[]
}

export interface ProvisioningReadyResult {
  displayName: string
  repoUrl: string
  defaultBranch: string
  metadata?: Record<string, string>
}

export interface ProvisionerErrorPayload {
  message: string
  code?: string
  category?: ProvisioningErrorCategory
  retryable?: boolean
  details?: Record<string, string>
}

interface ProvisionerRequestBase {
  protocolVersion: number
  operation: 'listTemplates' | 'create' | 'health'
  requestId?: string
}

export interface ListTemplatesProvisionerRequest extends ProvisionerRequestBase {
  operation: 'listTemplates'
  fresh?: boolean
}

export interface CreateProvisionerRequest extends ProvisionerRequestBase {
  operation: 'create'
  templateId: string
  inputs: Record<string, TemplateInputValue>
}

export interface HealthProvisionerRequest extends ProvisionerRequestBase {
  operation: 'health'
}

export type ProvisionerRequest = ListTemplatesProvisionerRequest | CreateProvisionerRequest | HealthProvisionerRequest

interface ProvisionerEventBase {
  protocolVersion: number
  requestId?: string
  event: 'progress' | 'result' | 'error'
}

export interface ProvisionerProgressEvent extends ProvisionerEventBase {
  event: 'progress'
  message: string
  stage?: 'provisioning' | 'cloning' | 'registering' | 'ready'
  status?: 'running' | 'waiting' | 'done' | 'error'
  percent?: number
  retryable?: boolean
}

export interface ProvisionerResultEvent<T = unknown> extends ProvisionerEventBase {
  event: 'result'
  result: T
}

export interface ProvisionerErrorEvent extends ProvisionerEventBase {
  event: 'error'
  error: ProvisionerErrorPayload
}

export type ProvisionerEvent<T = unknown> = ProvisionerProgressEvent | ProvisionerResultEvent<T> | ProvisionerErrorEvent

export interface ProvisioningCreateRequest {
  templateQualifiedId: string
  inputs: Record<string, TemplateInputValue>
}

export interface ProvisioningCreateResult {
  requestId: string
  templateQualifiedId: string
  project: {
    id: string
    path: string
    name: string
    baseBranch: string
  }
  metadata?: Record<string, string>
}

export interface ProvisioningProgressPayload {
  requestId: string
  message: string
  templateQualifiedId?: string
  stage?: 'provisioning' | 'cloning' | 'registering' | 'ready'
  status?: 'running' | 'waiting' | 'done' | 'error'
  percent?: number
  retryable?: boolean
}

export type ProvisioningOperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ProvisioningErrorDescriptor }
