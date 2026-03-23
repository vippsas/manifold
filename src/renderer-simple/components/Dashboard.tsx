import React, { useEffect, useMemo, useState } from 'react'
import type { SimpleApp } from '../../shared/simple-types'
import type {
  ProvisioningProgressPayload,
  ProvisioningTemplateDescriptor,
} from '../../shared/provisioning-types'
import { AppCard } from './AppCard'
import { ConfirmDialog } from './ConfirmDialog'
import * as styles from './Dashboard.styles'

const LOGO = `  .--.      __  ___            _ ____      __    __
 / oo \\    /  |/  /___ _____  (_) __/___  / /___/ /
| \\__/ |  / /|_/ / __ \`/ __ \\/ / /_/ __ \\/ / __  /
 \\    /  / /  / / /_/ / / / / / __/ /_/ / / /_/ /
  \\__/  /_/  /_/\\__,_/_/ /_/_/_/  \\____/_/\\__,_/`

function Spinner(): React.JSX.Element {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'spin 0.6s linear infinite',
        verticalAlign: 'middle',
      }}
    />
  )
}

export interface StartAppRequest {
  name: string
  description: string
  templateQualifiedId: string
  templateTitle: string
  inputs: Record<string, string | boolean>
}

interface Props {
  apps: SimpleApp[]
  onStart: (request: StartAppRequest) => Promise<void>
  onSelectApp: (app: SimpleApp) => void
  onDeleteApp: (app: SimpleApp) => Promise<void>
  onDevMode: () => void
}

export function Dashboard({ apps, onStart, onSelectApp, onDeleteApp, onDevMode }: Props): React.JSX.Element {
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(false)
  const [appToDelete, setAppToDelete] = useState<SimpleApp | null>(null)
  const [templates, setTemplates] = useState<ProvisioningTemplateDescriptor[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({})
  const [progressMessage, setProgressMessage] = useState<string>('')
  const [createError, setCreateError] = useState<string | null>(null)

  const hasActiveApp = apps.some((a) => a.status === 'scaffolding' || a.status === 'building' || a.status === 'deploying')

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.qualifiedId === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  )

  const name = typeof formValues.name === 'string' ? formValues.name : ''
  const description = typeof formValues.description === 'string' ? formValues.description : ''
  const canSubmit = Boolean(selectedTemplate) && name.trim().length > 0 && description.trim().length > 0 && !loading

  useEffect(() => {
    const unsub = window.electronAPI.on('provisioning:progress', (...args: unknown[]) => {
      const payload = args[0] as ProvisioningProgressPayload | undefined
      if (payload?.message) {
        setProgressMessage(payload.message)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!showCreate) return
    if (templates.length > 0 || templatesLoading) return
    void loadTemplates(false)
  }, [showCreate, templates.length, templatesLoading])

  useEffect(() => {
    if (!selectedTemplate) return
    setFormValues((current) => {
      const next: Record<string, string | boolean> = {}
      for (const [key, schema] of Object.entries(selectedTemplate.paramsSchema.properties)) {
        if (current[key] !== undefined) {
          next[key] = current[key]
        } else if (schema.default !== undefined) {
          next[key] = schema.default
        } else {
          next[key] = schema.type === 'boolean' ? false : ''
        }
      }
      return next
    })
  }, [selectedTemplateId, selectedTemplate])

  const loadTemplates = async (fresh: boolean): Promise<void> => {
    setTemplatesLoading(true)
    setTemplatesError(null)
    try {
      const channel = fresh ? 'provisioning:refresh-templates' : 'provisioning:list-templates'
      const nextTemplates = (await window.electronAPI.invoke(channel)) as ProvisioningTemplateDescriptor[]
      setTemplates(nextTemplates)
      setSelectedTemplateId((current) => {
        if (current && nextTemplates.some((template) => template.qualifiedId === current)) return current
        return nextTemplates[0]?.qualifiedId ?? ''
      })
    } catch (err) {
      setTemplatesError(err instanceof Error ? err.message : String(err))
    } finally {
      setTemplatesLoading(false)
    }
  }

  const handleFieldChange = (key: string, value: string | boolean): void => {
    setFormValues((current) => ({ ...current, [key]: value }))
  }

  const handleStart = async (): Promise<void> => {
    if (!canSubmit || !selectedTemplate) return
    setLoading(true)
    setCreateError(null)
    setProgressMessage('Preparing template...')
    try {
      await onStart({
        name: name.trim(),
        description: description.trim(),
        templateQualifiedId: selectedTemplate.qualifiedId,
        templateTitle: selectedTemplate.title,
        inputs: Object.fromEntries(
          Object.entries(formValues).map(([key, value]) => [
            key,
            typeof value === 'string' ? value.trim() : value,
          ]),
        ),
      })
    } catch (err) {
      setLoading(false)
      setCreateError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleCancel = (): void => {
    if (loading) return
    setShowCreate(false)
    setSelectedTemplateId('')
    setFormValues({})
    setProgressMessage('')
    setCreateError(null)
  }

  return (
    <div style={styles.container}>
      <div style={styles.logoWrap}>
        <pre style={styles.logo}>{LOGO}</pre>
      </div>
      <div style={styles.header}>
        <div style={styles.title}>My Apps</div>
        <button
          style={{ ...styles.devViewButton, opacity: hasActiveApp ? 0.4 : 1, cursor: hasActiveApp ? 'not-allowed' : 'pointer' }}
          onClick={hasActiveApp ? undefined : onDevMode}
          disabled={hasActiveApp}
          title={hasActiveApp ? 'Unavailable while an app is building' : 'Switch to full developer mode'}
        >
          Developer View
        </button>
      </div>

      <div style={styles.grid}>
        {/* New App card — always first */}
        <div style={styles.newAppCard} onClick={() => setShowCreate(true)}>
          <div style={styles.newAppIcon}>+</div>
          <div style={styles.newAppLabel}>New App</div>
          <div style={styles.newAppTechRow}>Templates from your configured provisioners</div>
        </div>

        {apps.map((app) => (
          <AppCard
            key={app.sessionId}
            app={app}
            onClick={() => onSelectApp(app)}
            onDelete={() => setAppToDelete(app)}
          />
        ))}
      </div>

      {/* Create App Dialog */}
      {showCreate && (
        <div style={styles.overlay} onClick={handleCancel}>
          <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div style={styles.dialogTitle}>Create a new app</div>
            <div style={styles.helperText}>
              Choose a template, describe the app, and Manifold will provision the repository before starting the builder.
            </div>

            <label style={styles.fieldLabel}>Template</label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <select
                style={{ ...styles.select, marginBottom: 0, flex: 1 }}
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                disabled={loading || templatesLoading || templates.length === 0}
              >
                {templates.length === 0 && <option value="">No templates available</option>}
                {templates.map((template) => (
                  <option key={template.qualifiedId} value={template.qualifiedId}>
                    {template.title} - {template.provisionerLabel}
                  </option>
                ))}
              </select>
              <button
                style={{ ...styles.refreshButton, opacity: loading || templatesLoading ? 0.5 : 1 }}
                onClick={() => { void loadTemplates(true) }}
                disabled={loading || templatesLoading}
              >
                {templatesLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {selectedTemplate && (
              <div style={styles.templateMeta}>
                <div style={styles.templateTitleRow}>
                  <div style={styles.templateTitleText}>{selectedTemplate.title}</div>
                  <div style={styles.templateBadge}>{selectedTemplate.provisionerLabel}</div>
                </div>
                <div style={styles.templateDescription}>{selectedTemplate.description}</div>
              </div>
            )}

            {selectedTemplate && Object.entries(selectedTemplate.paramsSchema.properties).map(([key, schema], index) => {
              const value = formValues[key]
              const inputValue = typeof value === 'boolean' ? value : String(value ?? '')
              const required = selectedTemplate.paramsSchema.required?.includes(key) ?? false
              const label = schema.title ?? key

              if (schema.type === 'boolean') {
                return (
                  <label key={key} style={{ ...styles.fieldLabel, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(e) => handleFieldChange(key, e.target.checked)}
                      disabled={loading}
                    />
                    <span>{label}</span>
                  </label>
                )
              }

              const autoFocus = index === 0
              return (
                <React.Fragment key={key}>
                  <label style={styles.fieldLabel}>{label}{required ? ' *' : ''}</label>
                  {schema.multiline ? (
                    <textarea
                      style={styles.textarea}
                      placeholder={schema.placeholder ?? ''}
                      value={inputValue}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                      disabled={loading}
                      autoFocus={autoFocus}
                    />
                  ) : (
                    <input
                      style={styles.input}
                      placeholder={schema.placeholder ?? ''}
                      value={inputValue}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                      disabled={loading}
                      autoFocus={autoFocus}
                    />
                  )}
                </React.Fragment>
              )
            })}

            {templatesError && <div style={styles.errorText}>{templatesError}</div>}
            {createError && <div style={styles.errorText}>{createError}</div>}
            {loading && progressMessage && <div style={styles.statusText}>{progressMessage}</div>}

            <div style={styles.buttonRow}>
              <button style={styles.cancelButton} onClick={handleCancel} disabled={loading}>
                Cancel
              </button>
              <button
                style={{ ...styles.startButton, opacity: canSubmit ? 1 : 0.5 }}
                onClick={() => { void handleStart() }}
                disabled={!canSubmit}
              >
                {loading ? <><Spinner /> {progressMessage || 'Setting up...'}</> : 'Start Building'}
              </button>
            </div>
          </div>
        </div>
      )}

      {appToDelete && (
        <ConfirmDialog
          title={`Delete ${appToDelete.name}?`}
          message={`This will remove the app and its files at ${appToDelete.projectPath}. This cannot be undone.`}
          onConfirm={async () => {
            await onDeleteApp(appToDelete)
            setAppToDelete(null)
          }}
          onCancel={() => setAppToDelete(null)}
        />
      )}
    </div>
  )
}
