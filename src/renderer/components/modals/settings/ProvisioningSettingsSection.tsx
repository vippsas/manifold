import React from 'react'
import type { ProvisionerConfig, ProvisionerStatus } from '../../../../shared/provisioning-types'
import { modalStyles } from '../SettingsModal.styles'
import { createExternalProvisioner, parseProvisionerArgs, stringifyProvisionerArgs, validateProvisioners } from './provisioning-settings-helpers'
import { SectionCard, SectionHeader } from './SettingsSectionLayout'

interface Props {
  provisioners: ProvisionerConfig[]
  statuses: ProvisionerStatus[]
  onChange: (value: ProvisionerConfig[]) => void
  onCheckHealth: (provisionerId?: string) => Promise<void>
  onRefreshCatalog: (provisionerId?: string) => Promise<void>
}

function statusBadgeColor(state: ProvisionerStatus['state']): string {
  if (state === 'healthy') return 'var(--success)'
  if (state === 'unknown') return 'var(--text-muted)'
  return 'var(--error)'
}

export function ProvisioningSettingsSection({
  provisioners,
  statuses,
  onChange,
  onCheckHealth,
  onRefreshCatalog,
}: Props): React.JSX.Element {
  const validation = validateProvisioners(provisioners)

  function updateProvisioner(targetId: string, partial: Partial<ProvisionerConfig>): void {
    onChange(provisioners.map((entry) => entry.id === targetId ? { ...entry, ...partial } : entry))
  }

  function removeProvisioner(targetId: string): void {
    onChange(provisioners.filter((entry) => entry.id !== targetId))
  }

  return (
    <>
      <SectionHeader
        title="Provisioning"
        description="Configure bundled and external repository provisioners, validate health, and manage which template sources are active."
      />
      <SectionCard
        title="Provisioners"
        description="Each external provisioner is a local CLI executable that speaks the Manifold provisioning protocol."
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <button type="button" style={modalStyles.secondaryButton} onClick={() => onChange([...provisioners, createExternalProvisioner(provisioners)])}>Add External Provisioner</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={modalStyles.secondaryButton} onClick={() => { void onCheckHealth() }}>Check All</button>
            <button type="button" style={modalStyles.secondaryButton} onClick={() => { void onRefreshCatalog() }}>Refresh All</button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {provisioners.map((provisioner) => {
            const status = statuses.find((entry) => entry.provisionerId === provisioner.id)
            const errors = validation[provisioner.id] ?? []
            const builtin = provisioner.type === 'builtin'
            return (
              <div key={provisioner.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{provisioner.label || provisioner.id || 'Unnamed provisioner'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{provisioner.type === 'builtin' ? 'Bundled provisioner' : 'External CLI provisioner'}</div>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ border: `1px solid ${statusBadgeColor(status?.state ?? 'unknown')}`, borderRadius: 999, color: statusBadgeColor(status?.state ?? 'unknown'), fontSize: 11, fontWeight: 600, padding: '4px 8px' }}>
                      {status?.state ?? 'unknown'}
                    </span>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={provisioner.enabled} onChange={(event) => updateProvisioner(provisioner.id, { enabled: event.target.checked })} />
                      Enabled
                    </label>
                  </div>
                </div>

                <div style={modalStyles.fieldGrid}>
                  <label style={modalStyles.label}>
                    Label
                    <input type="text" value={provisioner.label} onChange={(event) => updateProvisioner(provisioner.id, { label: event.target.value })} style={modalStyles.input} />
                  </label>
                  <label style={modalStyles.label}>
                    Id
                    <input type="text" value={provisioner.id} onChange={(event) => updateProvisioner(provisioner.id, { id: event.target.value })} style={modalStyles.input} disabled={builtin} />
                  </label>
                  {provisioner.type === 'cli' && (
                    <>
                      <label style={{ ...modalStyles.label, ...modalStyles.fieldSpanFull }}>
                        Command
                        <input type="text" value={provisioner.command ?? ''} onChange={(event) => updateProvisioner(provisioner.id, { command: event.target.value })} style={modalStyles.input} placeholder="/usr/local/bin/manifold-company-provisioner" />
                      </label>
                      <label style={{ ...modalStyles.label, ...modalStyles.fieldSpanFull }}>
                        Arguments
                        <input type="text" value={stringifyProvisionerArgs(provisioner.args)} onChange={(event) => updateProvisioner(provisioner.id, { args: parseProvisionerArgs(event.target.value) })} style={modalStyles.input} placeholder="--profile engineering --region eu" />
                      </label>
                    </>
                  )}
                </div>

                {status?.summary && <div style={modalStyles.helpText}>{status.summary}</div>}
                {status?.lastFetchedAt && <div style={modalStyles.helpText}>Last catalog fetch: {new Date(status.lastFetchedAt).toLocaleString()}</div>}
                {errors.map((error) => <div key={error} style={{ ...modalStyles.helpText, color: 'var(--error)' }}>{error}</div>)}

                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="button" style={modalStyles.secondaryButton} onClick={() => { void onCheckHealth(provisioner.id) }}>Check Health</button>
                  <button type="button" style={modalStyles.secondaryButton} onClick={() => { void onRefreshCatalog(provisioner.id) }}>Refresh Catalog</button>
                  {!builtin && <button type="button" style={modalStyles.cancelButton} onClick={() => removeProvisioner(provisioner.id)}>Remove</button>}
                </div>
              </div>
            )
          })}
        </div>
      </SectionCard>
    </>
  )
}
