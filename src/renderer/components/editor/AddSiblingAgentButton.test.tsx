import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import type { AgentRuntime, SpawnAgentOptions } from '../../../shared/types'
import { AddSiblingAgentButton } from './AddSiblingAgentButton'

const MOCK_RUNTIMES: AgentRuntime[] = [
  { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
  { id: 'codex', name: 'Codex', binary: 'codex', installed: true },
  { id: 'gemini', name: 'Gemini', binary: 'gemini', installed: false },
  { id: 'ollama', name: 'Ollama', binary: 'ollama', installed: true, needsModel: true },
]

function setup(overrides: Partial<{
  worktreePath: string | null
  noWorktree: boolean
  projectId: string | null
  onLaunch: (opts: SpawnAgentOptions) => Promise<unknown>
}> = {}) {
  const onLaunch = overrides.onLaunch ?? vi.fn().mockResolvedValue(undefined)
  const invokeMock = vi.fn((channel: string) => {
    if (channel === 'runtimes:list') return Promise.resolve(MOCK_RUNTIMES)
    return Promise.resolve(null)
  })
  ;(window as unknown as { electronAPI: { invoke: typeof invokeMock } }).electronAPI = { invoke: invokeMock }

  const projectId = 'projectId' in overrides ? overrides.projectId! : 'proj-1'
  const worktreePath = 'worktreePath' in overrides ? overrides.worktreePath! : '/repo/wt'
  const noWorktree = overrides.noWorktree ?? false
  render(
    <AddSiblingAgentButton
      projectId={projectId}
      worktreePath={worktreePath}
      noWorktree={noWorktree}
      onLaunch={onLaunch}
    />
  )
  return { onLaunch, invokeMock }
}

describe('AddSiblingAgentButton', () => {
  beforeEach(() => {
    cleanup()
  })

  it('does not render when there is no worktree', () => {
    setup({ worktreePath: null })
    expect(screen.queryByRole('button', { name: /add agent/i })).toBeNull()
  })

  it('does not render for noWorktree sessions', () => {
    setup({ noWorktree: true })
    expect(screen.queryByRole('button', { name: /add agent/i })).toBeNull()
  })

  it('does not render without an active project', () => {
    setup({ projectId: null })
    expect(screen.queryByRole('button', { name: /add agent/i })).toBeNull()
  })

  it('opens the runtime picker when clicked', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /add agent/i }))
    await waitFor(() => expect(screen.getByText('Claude Code')).toBeTruthy())
    expect(screen.getByText('Codex')).toBeTruthy()
  })

  it('skips runtimes that need a model and runtimes that are not installed', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /add agent/i }))
    await waitFor(() => expect(screen.getByText('Claude Code')).toBeTruthy())
    expect(screen.queryByText('Ollama')).toBeNull()
    expect(screen.queryByText('Gemini')).toBeNull()
  })

  it('invokes onLaunch with existingWorktreePath when a runtime is picked', async () => {
    const onLaunch = vi.fn().mockResolvedValue(undefined)
    setup({ onLaunch })
    fireEvent.click(screen.getByRole('button', { name: /add agent/i }))
    await waitFor(() => screen.getByText('Codex'))
    fireEvent.click(screen.getByText('Codex'))
    expect(onLaunch).toHaveBeenCalledWith({
      projectId: 'proj-1',
      runtimeId: 'codex',
      prompt: '',
      existingWorktreePath: '/repo/wt',
    })
  })

  it('closes the popover after picking a runtime', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /add agent/i }))
    await waitFor(() => screen.getByText('Claude Code'))
    fireEvent.click(screen.getByText('Claude Code'))
    await waitFor(() => expect(screen.queryByText('Codex')).toBeNull())
  })
})
