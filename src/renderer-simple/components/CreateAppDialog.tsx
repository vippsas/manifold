import React, { useEffect, useMemo, useState } from 'react'
import type {
  ProvisioningCreateRequest,
  ProvisioningProgressPayload,
  ProvisioningTemplateCatalog,
  ProvisioningTemplateDescriptor,
  TemplateFieldSchema,
  TemplateInputValue,
} from '../../shared/provisioning-types'
import { CreateAppFieldControl } from './CreateAppFieldControl'
import * as styles from './CreateAppDialog.styles'

export interface StartAppRequest extends ProvisioningCreateRequest {
  name: string
  description: string
  templateTitle: string
  promptInstructions?: string
}

interface Props {
  open: boolean
  onClose: () => void
  onStart: (request: StartAppRequest) => Promise<void>
}

function Spinner(): React.JSX.Element {
  return <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite', verticalAlign: 'middle' }} />
}

function validateField(schema: TemplateFieldSchema, value: TemplateInputValue, required: boolean): string | null {
  if (schema.type === 'boolean') return null
  if (required && (value === '' || value === undefined)) return 'This field is required.'
  if (schema.enum?.length && value && !schema.enum.some((option) => option.value === value)) return 'Choose a valid option.'
  if ((schema.type === 'integer' || schema.type === 'number') && value !== '') {
    if (typeof value !== 'number' || Number.isNaN(value)) return 'Enter a valid number.'
    if (schema.minimum !== undefined && value < schema.minimum) return `Must be at least ${schema.minimum}.`
    if (schema.maximum !== undefined && value > schema.maximum) return `Must be at most ${schema.maximum}.`
  }
  return null
}

export function CreateAppDialog({ open, onClose, onStart }: Props): React.JSX.Element | null {
  const [catalog, setCatalog] = useState<ProvisioningTemplateCatalog>({ templates: [], provisioners: [] })
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [catalogRequested, setCatalogRequested] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [formValues, setFormValues] = useState<Record<string, TemplateInputValue>>({})
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [progressMessage, setProgressMessage] = useState('')

  const selectedTemplate = useMemo(
    () => catalog.templates.find((template) => template.qualifiedId === selectedTemplateId) ?? null,
    [catalog.templates, selectedTemplateId],
  )

  const fieldErrors = useMemo(() => {
    if (!selectedTemplate) return {}
    return Object.fromEntries(Object.entries(selectedTemplate.paramsSchema.properties).map(([key, schema]) => {
      const required = selectedTemplate.paramsSchema.required?.includes(key) ?? false
      return [key, validateField(schema, formValues[key] ?? '', required)]
    }))
  }, [formValues, selectedTemplate])

  const canSubmit = Boolean(selectedTemplate) && Object.values(fieldErrors).every((value) => !value) && !loading

  useEffect(() => {
    if (!open) {
      setCatalogRequested(false)
      return
    }
    if (catalogRequested || templatesLoading) return
    setCatalogRequested(true)
    void loadCatalog(false)
  }, [catalogRequested, open, templatesLoading])

  useEffect(() => {
    if (!open) return undefined
    return window.electronAPI.on('provisioning:progress', (payload: unknown) => {
      const next = payload as ProvisioningProgressPayload | undefined
      if (next?.message) setProgressMessage(next.message)
    })
  }, [open])

  useEffect(() => {
    if (!selectedTemplate) return
    setFormValues((current) => Object.fromEntries(Object.entries(selectedTemplate.paramsSchema.properties).map(([key, schema]) => {
      if (current[key] !== undefined) return [key, current[key]]
      if (schema.default !== undefined) return [key, schema.default]
      if (schema.enum?.[0]?.value && !selectedTemplate.paramsSchema.required?.includes(key)) return [key, '']
      if (schema.enum?.[0]?.value) return [key, schema.enum[0].value]
      return [key, schema.type === 'boolean' ? false : '']
    })))
  }, [selectedTemplate])

  if (!open) return null

  async function loadCatalog(fresh: boolean): Promise<void> {
    setTemplatesLoading(true)
    setCatalogError(null)
    try {
      const nextCatalog = (await window.electronAPI.invoke(
        fresh ? 'provisioning:refresh-templates' : 'provisioning:list-templates',
      )) as ProvisioningTemplateCatalog
      setCatalog(nextCatalog)
      setSelectedTemplateId((current) => current && nextCatalog.templates.some((template) => template.qualifiedId === current)
        ? current
        : nextCatalog.templates[0]?.qualifiedId ?? '')
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : String(error))
    } finally {
      setTemplatesLoading(false)
    }
  }

  async function handleStart(): Promise<void> {
    if (!selectedTemplate || !canSubmit) return
    setLoading(true)
    setCreateError(null)
    setProgressMessage('Preparing template...')
    try {
      await onStart({
        name: String(formValues.name ?? '').trim(),
        description: String(formValues.description ?? '').trim(),
        templateQualifiedId: selectedTemplate.qualifiedId,
        templateTitle: selectedTemplate.title,
        promptInstructions: selectedTemplate.promptInstructions,
        inputs: Object.fromEntries(Object.entries(formValues).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])),
      })
    } catch (error) {
      setLoading(false)
      setCreateError(error instanceof Error ? error.message : String(error))
    }
  }

  const selectedStatus = catalog.provisioners.find((status) => status.provisionerId === selectedTemplate?.provisionerId)

  return (
    <div style={styles.overlay} onClick={() => !loading && onClose()}>
      <div style={styles.dialog} onClick={(event) => event.stopPropagation()}>
        <div style={styles.dialogTitle}>Create a new app</div>
        <div style={styles.helperText}>Choose a template, describe the app, and Manifold will provision the repository before starting the builder.</div>
        <label style={styles.fieldLabel}>Template</label>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <select style={{ ...styles.select, marginBottom: 0, flex: 1 }} value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} disabled={loading || templatesLoading || catalog.templates.length === 0}>
            {catalog.templates.length === 0 && <option value="">No templates available</option>}
            {catalog.templates.map((template) => <option key={template.qualifiedId} value={template.qualifiedId}>{template.title} - {template.provisionerLabel}</option>)}
          </select>
          <button style={{ ...styles.actionButton, opacity: loading || templatesLoading ? 0.5 : 1 }} onClick={() => { void loadCatalog(true) }} disabled={loading || templatesLoading}>{templatesLoading ? 'Refreshing...' : 'Refresh'}</button>
        </div>

        {selectedTemplate && (
          <div style={styles.metaCard}>
            <div style={styles.metaTitleRow}>
              <strong>{selectedTemplate.title}</strong>
              <span style={styles.provisionerBadge}>{selectedTemplate.provisionerLabel}</span>
              <span style={styles.badge}>{selectedTemplate.catalogSource === 'cache' ? 'Cached' : 'Live'}</span>
              {selectedTemplate.isStale && <span style={styles.badge}>Stale</span>}
            </div>
            <div style={styles.metaDescription}>{selectedTemplate.description}</div>
            {selectedStatus?.summary && <div style={styles.statusText}>{selectedStatus.summary}</div>}
          </div>
        )}

        {selectedTemplate && Object.entries(selectedTemplate.paramsSchema.properties).map(([key, schema], index) => (
          <CreateAppFieldControl
            key={key}
            fieldKey={key}
            schema={schema}
            value={formValues[key] ?? ''}
            required={selectedTemplate.paramsSchema.required?.includes(key) ?? false}
            disabled={loading}
            error={fieldErrors[key] ?? undefined}
            autoFocus={index === 0}
            onChange={(value) => setFormValues((current) => ({ ...current, [key]: value }))}
          />
        ))}

        {catalogError && <div style={styles.errorText}>{catalogError}</div>}
        {createError && <div style={styles.errorText}>{createError}</div>}
        {loading && progressMessage && <div style={styles.statusText}>{progressMessage}</div>}

        <div style={styles.buttonRow}>
          <button style={styles.cancelButton} onClick={onClose} disabled={loading}>Cancel</button>
          <button style={{ ...styles.startButton, opacity: canSubmit ? 1 : 0.5 }} onClick={() => { void handleStart() }} disabled={!canSubmit}>
            {loading ? <><Spinner /> {progressMessage || 'Setting up...'}</> : 'Start Building'}
          </button>
        </div>
      </div>
    </div>
  )
}
