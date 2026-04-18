import { useEffect, useState } from 'react'
import type { AgentRuntime, Project } from '../../../shared/types'
import type { SuperagentCreateOptions } from '../../../shared/superagent-types'
import * as s from './NewSuperagentModal.styles'

export interface NewSuperagentModalProps {
  visible: boolean
  projects: Project[]
  defaultRuntime: string
  onLaunch: (options: SuperagentCreateOptions) => void
  onClose: () => void
}

export function NewSuperagentModal({ visible, projects, defaultRuntime, onLaunch, onClose }: NewSuperagentModalProps) {
  const [name, setName] = useState('')
  const [fleet, setFleet] = useState<string[]>([])
  const [runtimeId, setRuntimeId] = useState(defaultRuntime)
  const [runtimes, setRuntimes] = useState<AgentRuntime[]>([])

  useEffect(() => {
    if (!visible) return
    void window.electronAPI.invoke('runtimes:list').then((list) => {
      const supported = (list as AgentRuntime[]).filter((rt) => rt.orchestratorCapable)
      setRuntimes(supported)
      setRuntimeId((current) => {
        if (supported.some((rt) => rt.id === current)) return current
        return supported[0]?.id ?? ''
      })
    })
  }, [visible])

  useEffect(() => {
    setRuntimeId(defaultRuntime)
  }, [defaultRuntime])

  if (!visible) return null

  const canSubmit = name.trim().length > 0 && fleet.length > 0 && runtimeId.length > 0

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={s.title}>New Superagent</h2>

        <div style={s.field}>
          <label style={s.label}>Name</label>
          <input style={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. cross-repo auth rename" />
        </div>

        <div style={s.field}>
          <label style={s.label}>Runtime</label>
          <select style={s.input} value={runtimeId} onChange={(e) => setRuntimeId(e.target.value)}>
            {runtimes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.name}{rt.installed === false ? ' (not installed)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div style={s.field}>
          <label style={s.label}>Fleet ({fleet.length}/{projects.length})</label>
          <div style={s.fleetList}>
            {projects.map((p) => (
              <label key={p.id} style={s.fleetRow}>
                <input
                  type="checkbox"
                  checked={fleet.includes(p.id)}
                  onChange={(e) =>
                    setFleet((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)))
                  }
                />
                <span>{p.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={s.actions}>
          <button style={s.secondaryButton} onClick={onClose}>Cancel</button>
          <button
            style={{ ...s.primaryButton, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
            disabled={!canSubmit}
            onClick={() => onLaunch({ name, taskDescription: '', runtimeId, fleetProjectIds: fleet, initialPrompt: '' })}
          >
            Launch
          </button>
        </div>
      </div>
    </div>
  )
}
