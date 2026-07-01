import React from 'react'
import type { AgentRuntime, BranchInfo, PRInfo } from '../../../shared/types'
import { modalStyles } from './NewTaskModal.styles'
import { AgentDropdown, BranchPicker, PRPicker } from '../new-task'
import type { ExistingSubTab } from '../new-task'

interface Props {
  isGitProject: boolean
  worktreeEnabled: boolean
  setWorktreeEnabled: (v: boolean) => void
  runtimeId: string
  runtimes: AgentRuntime[]
  setRuntimeId: (id: string) => void
  runtimeInstalled: boolean
  selectedRuntime: AgentRuntime | undefined
  useExisting: boolean
  setUseExisting: (v: boolean) => void
  existingSubTab: ExistingSubTab
  setExistingSubTab: (t: ExistingSubTab) => void
  branches: BranchInfo[]
  baseBranch: string
  branchFilter: string
  setBranchFilter: (f: string) => void
  selectedBranch: string
  setSelectedBranch: (b: string) => void
  branchesLoading: boolean
  prs: PRInfo[]
  prFilter: string
  setPrFilter: (f: string) => void
  selectedPr: number | null
  setSelectedPr: (n: number | null) => void
  prsLoading: boolean
}

export function NewAgentAdvanced(p: Props): React.JSX.Element {
  return (
    <>
      <AgentDropdown value={p.runtimeId} onChange={p.setRuntimeId} runtimes={p.runtimes} />
      {!p.runtimeInstalled && (
        <p style={modalStyles.errorText}>
          {p.selectedRuntime?.name ?? p.runtimeId} is not installed. Please install it first.
        </p>
      )}

      {p.isGitProject && (
        <>
          {!p.useExisting && (
            <label style={modalStyles.checkboxLabel}>
              <input type="checkbox" checked={p.worktreeEnabled} onChange={(e) => p.setWorktreeEnabled(e.target.checked)} />
              Use an isolated worktree
            </label>
          )}

          <label style={modalStyles.checkboxLabel}>
            <input type="checkbox" checked={p.useExisting} onChange={(e) => p.setUseExisting(e.target.checked)} />
            Continue on an existing branch or PR
          </label>

          {p.useExisting && (
            <>
              <div style={modalStyles.subTabBar}>
                <button type="button" onClick={() => p.setExistingSubTab('branch')} style={{ ...modalStyles.subTab, ...(p.existingSubTab === 'branch' ? modalStyles.subTabActive : {}) }}>
                  Branch
                </button>
                <button type="button" onClick={() => p.setExistingSubTab('pr')} style={{ ...modalStyles.subTab, ...(p.existingSubTab === 'pr' ? modalStyles.subTabActive : {}) }}>
                  Pull Request
                </button>
              </div>

              {p.existingSubTab === 'branch' && (
                <BranchPicker branches={p.branches} baseBranch={p.baseBranch} allowBaseBranch filter={p.branchFilter} onFilterChange={p.setBranchFilter} selected={p.selectedBranch} onSelect={p.setSelectedBranch} loading={p.branchesLoading} />
              )}

              {p.existingSubTab === 'pr' && (
                <PRPicker prs={p.prs} filter={p.prFilter} onFilterChange={p.setPrFilter} selected={p.selectedPr} onSelect={p.setSelectedPr} loading={p.prsLoading} />
              )}
            </>
          )}
        </>
      )}
    </>
  )
}
