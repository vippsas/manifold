export const PROVISIONER_PROTOCOL_VERSION = 1

export type ProvisionerKind = 'builtin' | 'cli'

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

export type TemplateFieldType = 'string' | 'boolean'

export interface TemplateFieldSchema {
  type: TemplateFieldType
  title?: string
  description?: string
  default?: string | boolean
  placeholder?: string
  multiline?: boolean
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
}

export interface ProvisioningTemplateDescriptor extends ProvisionerTemplate {
  qualifiedId: string
  provisionerId: string
  provisionerLabel: string
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
  inputs: Record<string, string | boolean>
}

export interface HealthProvisionerRequest extends ProvisionerRequestBase {
  operation: 'health'
}

export type ProvisionerRequest =
  | ListTemplatesProvisionerRequest
  | CreateProvisionerRequest
  | HealthProvisionerRequest

interface ProvisionerEventBase {
  protocolVersion: number
  requestId?: string
  event: 'progress' | 'result' | 'error'
}

export interface ProvisionerProgressEvent extends ProvisionerEventBase {
  event: 'progress'
  message: string
}

export interface ProvisionerResultEvent<T = unknown> extends ProvisionerEventBase {
  event: 'result'
  result: T
}

export interface ProvisionerErrorEvent extends ProvisionerEventBase {
  event: 'error'
  error: ProvisionerErrorPayload
}

export type ProvisionerEvent<T = unknown> =
  | ProvisionerProgressEvent
  | ProvisionerResultEvent<T>
  | ProvisionerErrorEvent

export interface ProvisioningCreateRequest {
  templateQualifiedId: string
  inputs: Record<string, string | boolean>
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
}
