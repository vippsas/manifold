import React, { useState, useEffect, useCallback } from 'react'
import type { PRContext } from '../../shared/types'

interface PRPanelProps {
  sessionId: string
  branchName: string
  baseBranch: string
  onAiGenerate: (prompt: string) => Promise<string>
  getPRContext: () => Promise<PRContext>
  onClose: () => void
}

export function PRPanel({
  sessionId,
  branchName,
  baseBranch,
  onAiGenerate,
  getPRContext,
  onClose,
}: PRPanelProps): React.JSX.Element {
  const [title, setTitle] = useState(formatBranchAsTitle(branchName))
  const [description, setDescription] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(false)
  const [creating, setCreating] = useState(false)
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [context, setContext] = useState<PRContext | null>(null)

  useEffect(() => {
    void getPRContext().then(setContext)
  }, [getPRContext])

  const generateTitleAndDescription = useCallback(async (ctx: PRContext): Promise<void> => {
    setGenerating(true)
    setGenerateError(false)
    try {
      const [titleResult, descResult] = await Promise.all([
        onAiGenerate(
          `Write a short pull request title (\u226460 chars, imperative mood) for these changes. Output only the title, nothing else.\n\nCommits:\n${ctx.commits}\n\nFiles changed:\n${ctx.diffStat}`,
        ),
        onAiGenerate(
          `Write a pull request description in markdown. Include a brief summary and a bullet-point list of changes. Output only the markdown, nothing else.\n\nCommits:\n${ctx.commits}\n\nFiles changed:\n${ctx.diffStat}\n\nDiff (truncated):\n${ctx.diffPatch}`,
        ),
      ])
      if (titleResult) setTitle(titleResult)
      if (descResult) setDescription(descResult)
      if (!titleResult && !descResult) setGenerateError(true)
    } catch {
      setGenerateError(true)
    } finally {
      setGenerating(false)
    }
  }, [onAiGenerate])

  const handleCreate = async (): Promise<void> => {
    if (creating) return
    setCreating(true)
    try {
      const url = await window.electronAPI.invoke('pr:create', {
        sessionId,
        title,
        body: description,
      }) as string
      setPrUrl(url)
    } catch {
      setCreating(false)
    }
  }

  if (prUrl) {
    return (
      <div className="git-panel">
        <div className="git-panel-header">
          <span className="git-panel-title">Pull Request Created</span>
          <button className="git-panel-close" onClick={onClose} title="Close">
            &times;
          </button>
        </div>
        <div className="git-panel-body">
          <div className="git-panel-section git-panel-success">
            <p>PR created successfully!</p>
            <a href={prUrl} target="_blank" rel="noreferrer" className="git-panel-link">
              {prUrl}
            </a>
          </div>
        </div>
        <div className="git-panel-footer">
          <button className="git-panel-btn git-panel-btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="git-panel">
      <div className="git-panel-header">
        <span className="git-panel-title">Create Pull Request</span>
        <button className="git-panel-close" onClick={onClose} title="Close">
          &times;
        </button>
      </div>

      <div className="git-panel-body">
        <div className="git-panel-section">
          <label className="git-panel-label">Base Branch</label>
          <span className="git-panel-readonly mono">{baseBranch}</span>
        </div>

        <div className="git-panel-section">
          <button
            className="git-panel-btn git-panel-btn--small git-panel-btn--accent"
            onClick={() => context && void generateTitleAndDescription(context)}
            disabled={generating || !context}
            title="Generate PR title and description with AI"
            style={{ alignSelf: 'flex-start' }}
          >
            {generating ? 'Generating\u2026' : '\u2726 AI Generate'}
          </button>
          {generateError && (
            <span className="git-panel-error">AI generation failed — fill in the fields manually</span>
          )}
        </div>

        <div className="git-panel-section">
          <label className="git-panel-label">Title</label>
          <input
            className="git-panel-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="PR title"
          />
        </div>

        <div className="git-panel-section">
          <label className="git-panel-label">Description</label>
          <textarea
            className="git-panel-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="PR description"
            rows={8}
          />
        </div>
      </div>

      <div className="git-panel-footer">
        <button className="git-panel-btn git-panel-btn--secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="git-panel-btn git-panel-btn--primary"
          onClick={() => void handleCreate()}
          disabled={!title.trim() || creating}
        >
          {creating ? 'Creating\u2026' : 'Push & Create PR'}
        </button>
      </div>
    </div>
  )
}

function formatBranchAsTitle(branch: string): string {
  return branch
    .replace(/^manifold\//, '')
    .replace(/[-_]/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
}
