import { beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { StatusBar } from './StatusBar'
import type { AgentSession, FileChange } from '../../../shared/types'

const sampleSession: AgentSession = {
  id: 's1',
  projectId: 'p1',
  runtimeId: 'claude',
  branchName: 'manifold/oslo',
  worktreePath: '/wt1',
  status: 'running',
  pid: 1,
  additionalDirs: [],
}

const sampleChangedFiles: FileChange[] = [
  { path: 'src/file.ts', type: 'modified' },
  { path: 'src/new.ts', type: 'added' },
  { path: 'src/old.ts', type: 'deleted' },
]

beforeEach(() => {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: vi.fn().mockResolvedValue([{ name: 'main', source: 'both' }]),
    on: vi.fn(() => vi.fn()),
  }
})

describe('StatusBar', () => {
  it('displays "No active agent" when no session', () => {
    render(
      <StatusBar
        activeSession={null}
        changedFiles={[]}
        baseBranch="main"
      />,
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

  it('opens the workspace branch picker and shows upstream ahead/behind counts', async () => {
    const onSync = vi.fn().mockResolvedValue({ ok: true, output: '' })
    render(
      <StatusBar
        activeSession={sampleSession}
        changedFiles={sampleChangedFiles}
        baseBranch="main"
        branchTarget={{
          workspaceId: 'ws-1',
          projectId: 'p1',
          repoName: 'storefront',
          currentBranch: 'main',
          upstreamAheadBehind: { behind: 2, ahead: 3 },
          onCheckedOut: vi.fn(),
          onSync,
          onShowCommandOutput: vi.fn(),
        }}
      />,
    )

    const syncButton = screen.getByRole('button', { name: 'Sync changes: 2 behind, 3 ahead' })
    expect(syncButton).toHaveTextContent('2↓3↑')
    expect(syncButton.querySelector('.statusbar-sync-icon')).toHaveAttribute('viewBox', '0 0 16 16')
    fireEvent.click(syncButton)
    await waitFor(() => expect(onSync).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /main/ }))

    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Switch branch' })).toBeInTheDocument())
  })

  it('shows Git failures in a modal and opens their command output', async () => {
    const onShowCommandOutput = vi.fn()
    render(
      <StatusBar
        activeSession={sampleSession}
        changedFiles={[]}
        baseBranch="main"
        branchTarget={{
          workspaceId: 'ws-1',
          projectId: 'p1',
          repoName: 'storefront',
          currentBranch: 'main',
          upstreamAheadBehind: { behind: 1, ahead: 0 },
          onCheckedOut: vi.fn(),
          onSync: vi.fn().mockResolvedValue({
            ok: false,
            failedCommand: 'pull',
            message: 'Not possible to fast-forward',
            output: '$ git pull --ff-only\nNot possible to fast-forward',
          }),
          onShowCommandOutput,
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Sync changes/ }))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Git sync failed' })).toBeInTheDocument()
    })
    expect(screen.getByText('Not possible to fast-forward')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show Command Output' }))

    expect(onShowCommandOutput).toHaveBeenCalledWith('$ git pull --ff-only\nNot possible to fast-forward')
    expect(screen.queryByRole('dialog', { name: 'Git sync failed' })).not.toBeInTheDocument()
  })

  it('uses the shared sidebar spinner for the complete sync operation', async () => {
    let finishSync: (result: { ok: true; output: string }) => void = () => undefined
    const onSync = vi.fn(() => new Promise<{ ok: true; output: string }>((resolve) => { finishSync = resolve }))
    render(
      <StatusBar
        activeSession={sampleSession}
        changedFiles={[]}
        baseBranch="main"
        branchTarget={{
          workspaceId: 'ws-1',
          projectId: 'p1',
          repoName: 'storefront',
          currentBranch: 'main',
          upstreamAheadBehind: { behind: 1, ahead: 1 },
          onCheckedOut: vi.fn(),
          onSync,
          onShowCommandOutput: vi.fn(),
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Sync changes/ }))
    const busyButton = await screen.findByRole('button', { name: 'Syncing changes' })
    expect(busyButton.querySelector('.spinner')).toBeInTheDocument()
    expect(busyButton.querySelector('.statusbar-sync-icon')).not.toBeInTheDocument()

    finishSync({ ok: true, output: '' })
    await waitFor(() => expect(screen.getByRole('button', { name: /Sync changes/ })).toBeEnabled())
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
      <StatusBar
        activeSession={sampleSession}
        changedFiles={[]}
        baseBranch="main"
      />,
    )

    expect(screen.getByText('0 files changed')).toBeInTheDocument()
  })

  it('displays the base branch', () => {
    render(
      <StatusBar
        activeSession={null}
        changedFiles={[]}
        baseBranch="develop"
      />,
    )

    expect(screen.getByText('develop')).toBeInTheDocument()
  })

  it('shows base: label', () => {
    render(
      <StatusBar
        activeSession={null}
        changedFiles={[]}
        baseBranch="main"
      />,
    )

    expect(screen.getByText('main')).toBeInTheDocument()
  })

  it('does not render panel toggle or settings buttons — those live in the activity bar', () => {
    render(
      <StatusBar
        activeSession={sampleSession}
        changedFiles={[]}
        baseBranch="main"
      />,
    )

    expect(screen.queryByRole('button', { name: /open shell/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /settings/i })).not.toBeInTheDocument()
  })
})
