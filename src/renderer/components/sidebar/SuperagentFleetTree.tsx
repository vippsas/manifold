import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { Superagent } from '../../../shared/superagent-types'
import type { Project, AgentSession, FileTreeNode, FileChange } from '../../../shared/types'
import type { SessionSelectionOptions } from '../../session-selection'
import { sortProjectsByName } from '../../../shared/project-sort'
import { FileTree } from '../editor/FileTree'
import { useSuperagentFleetChanges } from '../../hooks/useSuperagentFleetChanges'

interface SuperagentFleetTreeProps {
  superagent: Superagent
  projects: Project[]
  allProjectSessions: Record<string, AgentSession[]>
  onSelectSession: (sessionId: string, projectId: string, options?: SessionSelectionOptions) => void
  onSelectFile?: (path: string) => void
}

export function SuperagentFleetTree({
  superagent,
  projects,
  allProjectSessions,
  onSelectSession,
  onSelectFile,
}: SuperagentFleetTreeProps): React.JSX.Element {
  const fleetProjects = useMemo(
    () => sortProjectsByName(
      superagent.fleetProjectIds
        .map((id) => projects.find((p) => p.id === id))
        .filter((p): p is Project => Boolean(p)),
    ),
    [projects, superagent.fleetProjectIds],
  )

  const worktreePathFor = useCallback(
    (projectId: string, fallbackPath: string): string =>
      superagent.fleetWorktreePaths?.[projectId] ?? fallbackPath,
    [superagent.fleetWorktreePaths],
  )

  const [trees, setTrees] = useState<Map<string, FileTreeNode>>(new Map())
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    Promise.all(
      fleetProjects.map((p) =>
        window.electronAPI
          .invoke('files:tree-for-superagent-project', superagent.id, p.id)
          .then((node) => [worktreePathFor(p.id, p.path), node as FileTreeNode] as const)
          .catch(() => null)
      )
    ).then((results) => {
      if (cancelled) return
      const next = new Map<string, FileTreeNode>()
      for (const r of results) {
        if (r) next.set(r[0], r[1])
      }
      setTrees(next)
    })
    return () => { cancelled = true }
  }, [superagent.id, fleetProjects.map((p) => p.id).join(','), worktreePathFor])

  const handleToggleExpand = useCallback((path: string): void => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const handleSelectFile = useCallback(
    (path: string): void => {
      onSelectFile?.(path)
    },
    [onSelectFile],
  )

  const childSessions = useMemo(() => fleetProjects.flatMap((project) =>
    (allProjectSessions[project.id] ?? [])
      .filter((session) => superagent.childSessionIds.includes(session.id))
      .map((session) => ({ session, project }))
  ), [allProjectSessions, fleetProjects, superagent.childSessionIds])

  const fleetChanges = useSuperagentFleetChanges(superagent.id)

  const primaryProject = fleetProjects[0]
  const primaryWorktreePath = primaryProject
    ? worktreePathFor(primaryProject.id, primaryProject.path)
    : null
  const primaryTree = primaryWorktreePath ? trees.get(primaryWorktreePath) ?? null : null
  const additionalTrees = new Map<string, FileTreeNode>()
  for (let i = 1; i < fleetProjects.length; i++) {
    const p = fleetProjects[i]
    const wt = worktreePathFor(p.id, p.path)
    const t = trees.get(wt)
    if (t) additionalTrees.set(wt, t)
  }

  const primaryChanges = useMemo<FileChange[]>(
    () => (primaryWorktreePath ? fleetChanges[primaryWorktreePath] ?? [] : []),
    [fleetChanges, primaryWorktreePath],
  )
  const additionalChanges = useMemo(() => {
    const map = new Map<string, FileChange[]>()
    for (const wt of additionalTrees.keys()) {
      map.set(wt, fleetChanges[wt] ?? [])
    }
    return map
  }, [fleetChanges, additionalTrees])

  const rootLabels = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of fleetProjects) {
      const wt = worktreePathFor(p.id, p.path)
      map.set(wt, p.name)
    }
    return map
  }, [fleetProjects, worktreePathFor])

  const additionalBranches = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const wt of additionalTrees.keys()) {
      map.set(wt, '')
    }
    return map
  }, [additionalTrees])

  return (
    <div style={styles.root}>
      <div style={styles.headerBlock}>
        <div style={styles.header}>Fleet</div>
        <div style={styles.subheader}>{superagent.name}</div>
      </div>
      {childSessions.length > 0 && (
        <div style={styles.agentsGroup}>
          <div style={styles.agentsHeader}>Child agents</div>
          {childSessions.map(({ session, project }) => (
            <div
              key={session.id}
              onClick={() => onSelectSession(
                session.id,
                project.id,
                { preserveSuperagent: true },
              )}
              style={styles.sessionRow}
              className="sidebar-item-row"
              title={`${project.name} — ${session.status}`}
            >
              <span style={statusDotStyle(session.status)} />
              <div style={styles.sessionText}>
                <span style={styles.sessionName}>{project.name}</span>
                <span style={styles.sessionMeta}>{session.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={styles.treeWrapper}>
        {fleetProjects.length === 0 ? (
          <div style={styles.empty}>No fleet projects</div>
        ) : !primaryTree ? (
          <div style={styles.empty}>Loading files...</div>
        ) : (
          <FileTree
            tree={primaryTree}
            additionalTrees={additionalTrees.size > 0 ? additionalTrees : undefined}
            additionalBranches={additionalBranches.size > 0 ? additionalBranches : undefined}
            rootLabels={rootLabels}
            flattenRoots={true}
            primaryBranch=""
            changes={primaryChanges}
            additionalChanges={additionalChanges.size > 0 ? additionalChanges : undefined}
            activeFilePath={null}
            openFilePaths={EMPTY_SET}
            expandedPaths={expandedPaths}
            onToggleExpand={handleToggleExpand}
            onSelectFile={handleSelectFile}
            worktreeRootPath={primaryWorktreePath ?? primaryProject?.path}
          />
        )}
      </div>
    </div>
  )
}

const EMPTY_SET: Set<string> = new Set()

const statusColor = (status: AgentSession['status']): string => {
  switch (status) {
    case 'running': return 'var(--status-running, #22c55e)'
    case 'waiting': return 'var(--status-waiting, #eab308)'
    case 'error': return 'var(--error, #ef4444)'
    case 'done': return 'var(--text-muted)'
    default: return 'var(--text-muted)'
  }
}

const statusDotStyle = (status: AgentSession['status']): React.CSSProperties => ({
  width: 8, height: 8, borderRadius: '50%', background: statusColor(status), flexShrink: 0,
})

const styles = {
  root: { display: 'flex', flexDirection: 'column' as const, height: '100%', overflow: 'hidden' },
  headerBlock: { padding: '8px 8px 4px 8px' },
  header: { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: 1 },
  subheader: { fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 },
  empty: { fontSize: 12, color: 'var(--text-muted)', padding: 8 },
  agentsGroup: { display: 'flex', flexDirection: 'column' as const, gap: 2, padding: '4px 8px 8px 8px', borderBottom: '1px solid var(--border)' },
  agentsHeader: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5, padding: '2px 0' },
  sessionRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 6px', cursor: 'pointer', borderRadius: 4,
    fontSize: 12,
  },
  sessionText: {
    display: 'flex',
    flexDirection: 'column' as const,
    minWidth: 0,
    gap: 1,
    flex: 1,
  },
  sessionName: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  sessionMeta: { fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  treeWrapper: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' as const },
}
