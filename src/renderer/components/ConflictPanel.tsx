import React, { useState, useCallback, useRef } from 'react'

interface ConflictPanelProps {
  sessionId: string
  conflicts: string[]
  onAiGenerate: (prompt: string) => Promise<string>
  onResolveConflict: (filePath: string, resolvedContent: string) => Promise<void>
  onSelectFile: (filePath: string) => void
  onClose: () => void
}

type ResolutionStatus = 'pending' | 'resolving' | 'resolved' | 'failed'

interface ResolvedFile {
  filePath: string
  proposedContent: string
  status: ResolutionStatus
}

function updateResolution(
  filePath: string,
  proposedContent: string,
  status: ResolutionStatus
): (prev: Map<string, ResolvedFile>) => Map<string, ResolvedFile> {
  return (prev) => {
    const next = new Map(prev)
    next.set(filePath, { filePath, proposedContent, status })
    return next
  }
}

export function ConflictPanel({
  sessionId,
  conflicts,
  onAiGenerate,
  onResolveConflict,
  onSelectFile,
  onClose,
}: ConflictPanelProps): React.JSX.Element {
  const [resolutions, setResolutions] = useState<Map<string, ResolvedFile>>(new Map())
  const resolutionsRef = useRef(resolutions)
  resolutionsRef.current = resolutions
  const [completingMerge, setCompletingMerge] = useState(false)

  const allResolved = conflicts.length > 0 && conflicts.every(
    (f) => resolutions.get(f)?.status === 'resolved'
  )

  const handleResolveWithAI = useCallback(async (filePath: string): Promise<void> => {
    setResolutions(updateResolution(filePath, '', 'resolving'))

    try {
      const fileContent = await window.electronAPI.invoke('files:read', sessionId, filePath) as string
      const prompt = `You are resolving a git merge conflict. The file below contains conflict markers. Output only the fully resolved file content with all conflict markers removed, choosing the best resolution. Do not explain.\n\n${fileContent}`
      const resolved = await onAiGenerate(prompt)

      if (!resolved) {
        onSelectFile(filePath)
        setResolutions(updateResolution(filePath, '', 'failed'))
        return
      }

      setResolutions(updateResolution(filePath, resolved, 'pending'))
    } catch {
      setResolutions(updateResolution(filePath, '', 'failed'))
    }
  }, [sessionId, onAiGenerate, onSelectFile])

  const handleAccept = useCallback(async (filePath: string): Promise<void> => {
    const resolution = resolutionsRef.current.get(filePath)
    if (!resolution?.proposedContent) return
    try {
      await onResolveConflict(filePath, resolution.proposedContent)
      setResolutions(updateResolution(filePath, resolution.proposedContent, 'resolved'))
    } catch {
      // Resolution failed -- user can retry
    }
  }, [onResolveConflict])

  const handleCompleteMerge = async (): Promise<void> => {
    if (completingMerge) return
    setCompletingMerge(true)
    try {
      await window.electronAPI.invoke('git:commit', sessionId, '')
      onClose()
    } catch {
      setCompletingMerge(false)
    }
  }

  return (
    <div className="git-panel">
      <div className="git-panel-header">
        <span className="git-panel-title">Merge Conflicts</span>
        <button className="git-panel-close" onClick={onClose} title="Close">
          &times;
        </button>
      </div>

      <div className="git-panel-body">
        <ul className="git-panel-file-list">
          {conflicts.map((filePath) => {
            const resolution = resolutions.get(filePath)
            return (
              <li key={filePath} className="git-panel-conflict-item">
                <span className="git-panel-conflict-path truncate">{filePath}</span>
                <div className="git-panel-conflict-actions">
                  {resolution?.status === 'resolved' ? (
                    <span className="git-panel-resolved-badge">Resolved</span>
                  ) : resolution?.status === 'resolving' ? (
                    <span className="git-panel-resolving">Resolving...</span>
                  ) : resolution?.status === 'pending' && resolution.proposedContent ? (
                    <>
                      <button
                        className="git-panel-btn git-panel-btn--small"
                        onClick={() => void handleAccept(filePath)}
                      >
                        Accept
                      </button>
                      <button
                        className="git-panel-btn git-panel-btn--small"
                        onClick={() => onSelectFile(filePath)}
                      >
                        Edit
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="git-panel-btn git-panel-btn--small"
                        onClick={() => onSelectFile(filePath)}
                      >
                        View
                      </button>
                      <button
                        className="git-panel-btn git-panel-btn--small git-panel-btn--accent"
                        onClick={() => void handleResolveWithAI(filePath)}
                      >
                        Resolve with AI
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="git-panel-footer">
        <button className="git-panel-btn git-panel-btn--secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="git-panel-btn git-panel-btn--primary"
          onClick={() => void handleCompleteMerge()}
          disabled={!allResolved || completingMerge}
        >
          {completingMerge ? 'Completing\u2026' : 'Complete Merge'}
        </button>
      </div>
    </div>
  )
}
