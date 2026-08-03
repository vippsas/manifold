import React, { useCallback, useMemo } from 'react'
import { TerminalPane } from '../../terminal/TerminalPane'
import { OnboardingView } from '../../modals/OnboardingView'
import { AgentChatView } from './AgentChatView'
import { DraftChatView } from './DraftChatView'
import { useDockState } from './dock-panel-types'
import { parseSiblingSessionId } from '../../../hooks/agent-session/agent-siblings'
import { collectAgentMentionPaths, hasAgentPathDragData, readAgentPathDragData } from '../file-tree/file-tree-drag'
import type { FileDropConfig } from '../../../../renderer-shared/chat/ChatPane'
import type { SpawnAgentOptions } from '../../../../shared/types'

const AGENT_CHAT_FILE_DROP: FileDropConfig = {
  hasPath: hasAgentPathDragData,
  readPath: readAgentPathDragData,
}

interface AgentTerminalViewProps {
  sessionId: string
  scrollbackLines: number
  terminalFontFamily?: string
  xtermTheme?: import('@xterm/xterm').ITheme
  isExited: boolean
  onRestart: () => void
}

// Memoized so file clicks (which mutate unrelated dock-state fields like
// lastFileOpenRequest, openFiles, etc.) don't tear through the terminal subtree.
// The outer AgentPanel still re-renders on every context change, but its
// returned element here is shallow-equal across those renders and short-circuits.
const AgentTerminalView = React.memo(function AgentTerminalView({
  sessionId,
  scrollbackLines,
  terminalFontFamily,
  xtermTheme,
  isExited,
  onRestart,
}: AgentTerminalViewProps): React.JSX.Element {
  return (
    <div style={agentTerminalWrapperStyle}>
      <TerminalPane
        sessionId={sessionId}
        scrollbackLines={scrollbackLines}
        terminalFontFamily={terminalFontFamily}
        label="Agent"
        xtermTheme={xtermTheme}
      />
      {isExited && (
        <div style={restartOverlayStyles.container}>
          <button onClick={onRestart} style={restartOverlayStyles.button}>
            Restart Agent
          </button>
        </div>
      )}
    </div>
  )
})

const agentTerminalWrapperStyle: React.CSSProperties = { position: 'relative', height: '100%' }

const restartOverlayStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    display: 'flex',
    justifyContent: 'center',
    padding: '12px',
    background: 'linear-gradient(transparent, var(--bg-primary) 40%)',
    pointerEvents: 'none',
  },
  button: {
    pointerEvents: 'auto',
    padding: '6px 20px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--bg-primary)',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
}

export function AgentPanel({ api }: { api?: { id: string } } = {}): React.JSX.Element {
  const s = useDockState()
  const activeProject = s.projects.find((p) => p.id === s.activeProjectId)

  const mentionRoot = s.worktreeRootPath ?? s.tree?.path ?? ''
  const mentionPaths = useMemo(
    () => (mentionRoot ? collectAgentMentionPaths(s.tree, mentionRoot) : []),
    [s.tree, mentionRoot],
  )

  const panelId = api?.id ?? 'agent'
  const siblingSessionId = parseSiblingSessionId(panelId)
  const targetSessionId = siblingSessionId ?? s.primarySessionId ?? s.sessionId

  const projectSessions = s.activeProjectId
    ? s.allProjectSessions[s.activeProjectId] ?? []
    : []
  const targetSession = targetSessionId
    ? projectSessions.find((session) => session.id === targetSessionId)
      ?? Object.values(s.allProjectSessions).flat().find((session) => session.id === targetSessionId)
      ?? null
    : null
  const targetRuntimeId = targetSession?.runtimeId ?? null
  const targetStatus = targetSession?.status ?? null

  const onResumeAgent = s.onResumeAgent
  const handleRestart = useCallback(() => {
    if (targetSessionId && targetRuntimeId) {
      void onResumeAgent(targetSessionId, targetRuntimeId)
    }
  }, [targetSessionId, targetRuntimeId, onResumeAgent])

  if (s.activeDraft) {
    const activeDraft = s.activeDraft
    const draftProject = s.projects.find((p) => p.id === activeDraft.projectId)
    return (
      <DraftChatView
        onFirstSend={(text) => { void s.promoteDraft(activeDraft.id, text) }}
        projectName={draftProject?.name}
        branchName={activeDraft.branchName}
        slashCommands={draftProject?.slashCommands}
      />
    )
  }

  // An agent is started in a workspace, never in a folder: the focused workspace,
  // or whichever holds the open folder (every folder is in at least its home
  // workspace). Without one there is nothing to start an agent in.
  const workspace = s.workspaces?.find((w) => w.id === s.activeWorkspaceId)
    ?? s.workspaces?.find((w) => !!s.activeProjectId && w.projectIds.includes(s.activeProjectId))

  if (!targetSessionId && workspace && s.onLaunchWorkspaceAgent) {
    const launchWorkspaceAgent = s.onLaunchWorkspaceAgent
    const primaryProject = s.projects.find((p) => p.id === workspace.projectIds[0])
    const workspaceSessions = Object.values(s.allProjectSessions)
      .flat()
      .filter((session) => session.workspaceId === workspace.id)
    return (
      <OnboardingView
        variant="no-agent"
        workspaceName={workspace.name}
        primaryPath={workspace.worktreePaths?.[workspace.projectIds[0]] ?? primaryProject?.path ?? ''}
        branchLabel={workspace.branchName}
        defaultRuntime={workspace.runtimeId ?? s.defaultRuntime}
        defaultAgentMode={s.defaultAgentMode}
        onLaunch={(opts) => launchWorkspaceAgent(workspace.id, opts)}
        existingSessions={workspaceSessions}
        onResumeSession={s.onResumeAgent}
        onDeleteSession={(session) => s.onRequestDeleteAgent(session, primaryProject?.path ?? '')}
      />
    )
  }

  if (!targetSessionId) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 12 }}>Select a workspace to get started</div>
  }

  const isExited = targetStatus === 'done' || targetStatus === 'error'

  if (targetSession?.nonInteractive) {
    return <AgentChatView sessionId={targetSessionId} mentionPaths={mentionPaths} fileDrop={AGENT_CHAT_FILE_DROP} />
  }

  return (
    <AgentTerminalView
      sessionId={targetSessionId}
      scrollbackLines={s.scrollbackLines}
      terminalFontFamily={s.terminalFontFamily}
      xtermTheme={s.xtermTheme}
      isExited={isExited}
      onRestart={handleRestart}
    />
  )
}
