import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { StatusBar } from './StatusBar'
import type { AgentSession, FileChange } from '../../shared/types'

const sampleSession: AgentSession = {
  id: 's1',
  projectId: 'p1',
  runtimeId: 'claude',
  branchName: 'manifold/oslo',
  worktreePath: '/wt1',
  status: 'running',
  pid: 1,
}

const sampleChangedFiles: FileChange[] = [
  { path: 'src/file.ts', type: 'modified' },
  { path: 'src/new.ts', type: 'added' },
  { path: 'src/old.ts', type: 'deleted' },
]

describe('StatusBar', () => {
  it('displays "No active agent" when no session', () => {
    render(
      <StatusBar activeSession={null} changedFiles={[]} baseBranch="main" />,
    )

    expect(screen.getByText('No active agent')).toBeInTheDocument()
  })

  it('displays branch name when session is active', () => {
    render(
      <StatusBar
        activeSession={sampleSession}
        changedFiles={sampleChangedFiles}
        baseBranch="main"
      />,
    )

    expect(screen.getByText('manifold/oslo')).toBeInTheDocument()
  })

  it('displays file count (plural)', () => {
    render(
      <StatusBar
        activeSession={sampleSession}
        changedFiles={sampleChangedFiles}
        baseBranch="main"
      />,
    )

    expect(screen.getByText('3 files changed')).toBeInTheDocument()
  })

  it('displays file count (singular)', () => {
    render(
      <StatusBar
        activeSession={sampleSession}
        changedFiles={[{ path: 'a.ts', type: 'modified' }]}
        baseBranch="main"
      />,
    )

    expect(screen.getByText('1 file changed')).toBeInTheDocument()
  })

  it('displays zero files changed', () => {
    render(
      <StatusBar activeSession={sampleSession} changedFiles={[]} baseBranch="main" />,
    )

    expect(screen.getByText('0 files changed')).toBeInTheDocument()
  })

  it('displays the base branch', () => {
    render(
      <StatusBar activeSession={null} changedFiles={[]} baseBranch="develop" />,
    )

    expect(screen.getByText('develop')).toBeInTheDocument()
  })

  it('shows base: label', () => {
    render(
      <StatusBar activeSession={null} changedFiles={[]} baseBranch="main" />,
    )

    expect(screen.getByText('main')).toBeInTheDocument()
  })
})
