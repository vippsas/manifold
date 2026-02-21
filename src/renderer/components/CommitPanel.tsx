import React, { useState, useEffect, useRef } from 'react'
import type { FileChange } from '../../shared/types'

interface CommitPanelProps {
  changedFiles: FileChange[]
  diff: string
  onCommit: (message: string) => Promise<void>
  onAiGenerate: (prompt: string) => Promise<string>
  onClose: () => void
}

export function CommitPanel({
  changedFiles,
  diff,
  onCommit,
  onAiGenerate,
  onClose,
}: CommitPanelProps): React.JSX.Element {
  const [message, setMessage] = useState('')
  const [generating, setGenerating] = useState(false)
  const [committing, setCommitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!diff) return
    setGenerating(true)
    const prompt = `Write a concise git commit message (subject line only, imperative mood, \u226472 chars) for the following diff. Output only the message, nothing else.\n\n${diff.slice(0, 8000)}`
    void onAiGenerate(prompt).then((result) => {
      if (result) setMessage(result)
      setGenerating(false)
      textareaRef.current?.focus()
    })
  }, [diff, onAiGenerate])

  const handleCommit = async (): Promise<void> => {
    if (!message.trim() || committing) return
    setCommitting(true)
    try {
      await onCommit(message.trim())
      onClose()
    } catch {
      setCommitting(false)
    }
  }

  return (
    <div className="git-panel">
      <div className="git-panel-header">
        <span className="git-panel-title">Commit Changes</span>
        <button className="git-panel-close" onClick={onClose} title="Close">
          &times;
        </button>
      </div>

      <div className="git-panel-body">
        <div className="git-panel-section">
          <label className="git-panel-label">
            Changed Files ({changedFiles.length})
          </label>
          <ul className="git-panel-file-list">
            {changedFiles.map((f) => (
              <li key={f.path} className={`git-panel-file git-panel-file--${f.type}`}>
                <span className="git-panel-file-badge">{f.type[0].toUpperCase()}</span>
                <span className="truncate">{f.path}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="git-panel-section">
          <label className="git-panel-label">Commit Message</label>
          <textarea
            ref={textareaRef}
            className="git-panel-textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={generating ? 'Generating message\u2026' : 'Enter commit message'}
            rows={4}
          />
        </div>
      </div>

      <div className="git-panel-footer">
        <button className="git-panel-btn git-panel-btn--secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="git-panel-btn git-panel-btn--primary"
          onClick={() => void handleCommit()}
          disabled={!message.trim() || committing}
        >
          {committing ? 'Committing\u2026' : 'Commit'}
        </button>
      </div>
    </div>
  )
}
