import React, { useEffect, useState } from 'react'
import { SectionCard, SectionHeader } from './SettingsSectionLayout'

interface PluginConfigProperty {
  type: 'string' | 'number' | 'boolean'
  default?: unknown
  description?: string
  enum?: string[]
}

interface PluginEntry {
  id: string
  title: string
  enabled: boolean
  properties: Record<string, PluginConfigProperty> | null
  values: Record<string, unknown>
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', borderRadius: 4,
  background: 'var(--bg-input)', color: 'var(--text-default)',
  border: '1px solid var(--border-subtle)', fontSize: 13,
}

const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.75, marginBottom: 4, display: 'block' }
const descStyle: React.CSSProperties = { fontSize: 11, opacity: 0.55, marginTop: 2 }
const fieldRow: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }

const disabledNoteStyle: React.CSSProperties = { fontSize: 11, opacity: 0.55, marginTop: 4, fontStyle: 'italic' }

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return window.electronAPI.invoke(channel, ...args) as Promise<T>
}

export function PluginSettingsSection(): React.JSX.Element {
  const [plugins, setPlugins] = useState<PluginEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = await invoke<any[]>('plugins:list')
      const entries: PluginEntry[] = []
      for (const plugin of list) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const props: Record<string, PluginConfigProperty> | undefined = plugin?.manifest?.contributes?.configuration?.properties as any
        const hasConfig = props != null && Object.keys(props).length > 0
        let properties: Record<string, PluginConfigProperty> | null = null
        let values: Record<string, unknown> = {}
        if (hasConfig) {
          const config = await invoke<{ properties: Record<string, PluginConfigProperty>; values: Record<string, unknown> }>('plugins:get-config', plugin.id as string)
          properties = config.properties
          values = config.values
        }
        entries.push({
          id: plugin.id as string,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          title: (plugin?.manifest?.displayName as string | undefined) ?? (plugin.id as string),
          enabled: Boolean(plugin.enabled),
          properties,
          values,
        })
      }
      if (!cancelled) {
        setPlugins(entries)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  function handleToggleEnabled(pluginId: string, nextEnabled: boolean): void {
    setPlugins((prev) =>
      prev.map((p) =>
        p.id === pluginId ? { ...p, enabled: nextEnabled } : p
      )
    )
    void invoke('plugins:set-enabled', pluginId, nextEnabled)
  }

  function handleChange(pluginId: string, key: string, rawValue: unknown, propType: 'string' | 'number' | 'boolean'): void {
    const coerced: unknown = propType === 'number' ? Number(rawValue) : rawValue
    setPlugins((prev) =>
      prev.map((p) =>
        p.id === pluginId
          ? { ...p, values: { ...p.values, [key]: coerced } }
          : p
      )
    )
    void invoke('plugins:set-config', pluginId, key, coerced)
  }

  if (loading) {
    return (
      <>
        <SectionHeader title="Plugins" description="Manage installed plugins. Disabling a plugin that is already running takes full effect after a restart." />
      </>
    )
  }

  if (plugins.length === 0) {
    return (
      <>
        <SectionHeader title="Plugins" description="Manage installed plugins. Disabling a plugin that is already running takes full effect after a restart." />
        <SectionCard title="No plugins installed" description="Install plugins to manage and configure them here.">
          <div style={{ fontSize: 13, opacity: 0.7, paddingTop: 4 }}>No plugins installed.</div>
        </SectionCard>
      </>
    )
  }

  return (
    <>
      <SectionHeader title="Plugins" description="Manage installed plugins. Disabling a plugin that is already running takes full effect after a restart." />
      {plugins.map((plugin) => {
        const showConfig = plugin.enabled && plugin.properties != null && Object.keys(plugin.properties).length > 0
        return (
          <SectionCard key={plugin.id} title={plugin.title} description={plugin.id}>
            {/* Enable/disable toggle */}
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <input
                type="checkbox"
                id={`${plugin.id}-enabled`}
                checked={plugin.enabled}
                onChange={(e) => handleToggleEnabled(plugin.id, e.target.checked)}
              />
              <label htmlFor={`${plugin.id}-enabled`} style={{ fontSize: 13 }}>
                {plugin.enabled ? 'Enabled' : 'Disabled'}
              </label>
            </div>
            {!plugin.enabled && (
              <div style={disabledNoteStyle}>Disabled — hidden from + Apps</div>
            )}

            {/* Config fields — only shown when enabled and config exists */}
            {showConfig && plugin.properties != null && Object.entries(plugin.properties).map(([key, prop]) => {
              const currentValue = plugin.values[key] !== undefined ? plugin.values[key] : prop.default

              if (prop.type === 'boolean') {
                return (
                  <div key={key} style={{ ...fieldRow, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      id={`${plugin.id}-${key}`}
                      checked={Boolean(currentValue)}
                      onChange={(e) => handleChange(plugin.id, key, e.target.checked, 'boolean')}
                    />
                    <div>
                      <label htmlFor={`${plugin.id}-${key}`} style={{ fontSize: 13 }}>{key}</label>
                      {prop.description && <div style={descStyle}>{prop.description}</div>}
                    </div>
                  </div>
                )
              }

              if (prop.enum && prop.enum.length > 0) {
                return (
                  <div key={key} style={fieldRow}>
                    <label htmlFor={`${plugin.id}-${key}`} style={labelStyle}>{key}</label>
                    <select
                      id={`${plugin.id}-${key}`}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                      value={String(currentValue ?? '')}
                      onChange={(e) => handleChange(plugin.id, key, e.target.value, prop.type)}
                    >
                      {prop.enum.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {prop.description && <div style={descStyle}>{prop.description}</div>}
                  </div>
                )
              }

              if (prop.type === 'number') {
                return (
                  <div key={key} style={fieldRow}>
                    <label htmlFor={`${plugin.id}-${key}`} style={labelStyle}>{key}</label>
                    <input
                      type="number"
                      id={`${plugin.id}-${key}`}
                      style={inputStyle}
                      value={String(currentValue ?? '')}
                      onChange={(e) => handleChange(plugin.id, key, e.target.value, 'number')}
                    />
                    {prop.description && <div style={descStyle}>{prop.description}</div>}
                  </div>
                )
              }

              // default: text
              return (
                <div key={key} style={fieldRow}>
                  <label htmlFor={`${plugin.id}-${key}`} style={labelStyle}>{key}</label>
                  <input
                    type="text"
                    id={`${plugin.id}-${key}`}
                    style={inputStyle}
                    value={String(currentValue ?? '')}
                    onChange={(e) => handleChange(plugin.id, key, e.target.value, 'string')}
                  />
                  {prop.description && <div style={descStyle}>{prop.description}</div>}
                </div>
              )
            })}
          </SectionCard>
        )
      })}
    </>
  )
}
