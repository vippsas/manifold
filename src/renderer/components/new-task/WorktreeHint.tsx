import React from 'react'
import { modalStyles } from '../NewTaskModal.styles'
import type { ModalTab, ExistingSubTab } from './types'
import type { PRInfo } from '../../../shared/types'

interface WorktreeHintProps {
  activeTab: ModalTab
  existingSubTab: ExistingSubTab
  baseBranch: string
  selectedBranch: string
  selectedPr: number | null
  prs: PRInfo[]
}

export function WorktreeHint({
  activeTab,
  existingSubTab,
  baseBranch,
  selectedBranch,
  selectedPr,
  prs,
}: WorktreeHintProps): React.JSX.Element {
  let text: React.ReactNode

  if (activeTab === 'new') {
    text = (
      <>
        Creates an isolated worktree branching from{' '}
        <span style={modalStyles.worktreeHintBranch}>{baseBranch}</span>
      </>
    )
  } else if (existingSubTab === 'branch' && selectedBranch) {
    text = (
      <>
        Creates an isolated worktree and checks out{' '}
        <span style={modalStyles.worktreeHintBranch}>{selectedBranch}</span>
      </>
    )
  } else if (existingSubTab === 'pr' && selectedPr !== null) {
    const pr = prs.find((p) => p.number === selectedPr)
    text = (
      <>
        Creates an isolated worktree for PR{' '}
        <span style={modalStyles.worktreeHintBranch}>
          #{selectedPr}
          {pr ? ` (${pr.headRefName})` : ''}
        </span>
      </>
    )
  } else {
    text = 'The agent will work in an isolated git worktree — your working tree stays untouched'
  }

  return (
    <p style={modalStyles.worktreeHint}>
      <span style={modalStyles.worktreeHintIcon}>&#8505;</span>
      {text}
    </p>
  )
}
