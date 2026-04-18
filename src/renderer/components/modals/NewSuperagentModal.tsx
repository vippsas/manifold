import { useState } from 'react'
import type { Project } from '../../../shared/types'
import type { SuperagentCreateOptions } from '../../../shared/superagent-types'
import * as s from './NewSuperagentModal.styles'

export interface NewSuperagentModalProps {
  visible: boolean
  projects: Project[]
  onLaunch: (options: SuperagentCreateOptions) => void
  onClose: () => void
}

export function NewSuperagentModal({ visible, projects, onLaunch, onClose }: NewSuperagentModalProps) {
  const [name, setName] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [initialPrompt, setInitialPrompt] = useState('')
  const [fleet, setFleet] = useState<string[]>([])

  if (!visible) return null

  const canSubmit = name.trim().length > 0 && taskDescription.trim().length > 0 && fleet.length > 0

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={s.title}>New Superagent</h2>

        <div style={s.field}>
          <label style={s.label}>Name</label>
          <input style={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. cross-repo auth rename" />
        </div>

        <div style={s.field}>
          <label style={s.label}>Task description</label>
          <textarea style={{ ...s.input, minHeight: 60, fontFamily: 'inherit' }} value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} />
        </div>

        <div style={s.field}>
          <label style={s.label}>Runtime</label>
          <input style={{ ...s.input, opacity: 0.7 }} value="Claude Code" readOnly />
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

        <div style={s.field}>
          <label style={s.label}>Initial prompt</label>
          <textarea style={{ ...s.input, minHeight: 80, fontFamily: 'inherit' }} value={initialPrompt} onChange={(e) => setInitialPrompt(e.target.value)} placeholder="What should the orchestrator do first?" />
        </div>

        <div style={s.actions}>
          <button style={s.secondaryButton} onClick={onClose}>Cancel</button>
          <button
            style={{ ...s.primaryButton, opacity: canSubmit ? 1 : 0.5, cursor: canSubmit ? 'pointer' : 'not-allowed' }}
            disabled={!canSubmit}
            onClick={() => onLaunch({ name, taskDescription, fleetProjectIds: fleet, initialPrompt })}
          >
            Launch
          </button>
        </div>
      </div>
    </div>
  )
}
