import React, { useEffect, useState } from 'react'
import { SectionCard, SectionHeader } from './SettingsSectionLayout'

interface PluginConfigProperty {
  type: 'string' | 'number' | 'boolean'
  default?: unknown
  description?: string
  enum?: string[]
}

interface PluginConfigEntry {
  id: string
  title: string
  properties: Record<string, PluginConfigProperty>
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

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return window.electronAPI.invoke(channel, ...args) as Promise<T>
}

export function PluginSettingsSection(): React.JSX.Element {
  const [plugins, setPlugins] = useState<PluginConfigEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = await invoke<any[]>('plugins:list')
      const entries: PluginConfigEntry[] = []
      for (const plugin of list) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const props: Record<string, PluginConfigProperty> | undefined = plugin?.manifest?.contributes?.configuration?.properties as any
        if (!props || Object.keys(props).length === 0) continue
        const { properties, values } = await invoke<{ properties: Record<string, PluginConfigProperty>; values: Record<string, unknown> }>('plugins:get-config', plugin.id as string)
        entries.push({
          id: plugin.id as string,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          title: (plugin?.manifest?.displayName as string | undefined) ?? (plugin.id as string),
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
        <SectionHeader title="Plugins" description="Settings contributed by installed plugins." />
      </>
    )
  }

  if (plugins.length === 0) {
    return (
      <>
        <SectionHeader title="Plugins" description="Settings contributed by installed plugins." />
        <SectionCard title="No plugins installed" description="Install plugins that contribute configuration to see their settings here.">
          <div style={{ fontSize: 13, opacity: 0.7, paddingTop: 4 }}>No plugins with settings installed.</div>
        </SectionCard>
      </>
    )
  }

  return (
    <>
      <SectionHeader title="Plugins" description="Settings contributed by installed plugins." />
      {plugins.map((plugin) => (
        <SectionCard key={plugin.id} title={plugin.title} description={`Settings for the ${plugin.title} plugin.`}>
          {Object.entries(plugin.properties).map(([key, prop]) => {
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
      ))}
    </>
  )
}
