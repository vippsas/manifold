import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AddRepositoryModal } from './AddRepositoryModal'

vi.mock('../sidebar/NoProjectActions', async (importOriginal) => ({
  ...await importOriginal<typeof import('../sidebar/NoProjectActions')>(),
  NoProjectActions: (props: {
    onAddProject: () => void
    onCloneProject: (url: string) => void
    onCreateNewProject: (options: { description: string }) => void
  }) => <>
    <button onClick={props.onAddProject}>Open local</button>
    <button onClick={() => props.onCloneProject('https://example.com/repo.git')}>Clone</button>
    <button onClick={() => props.onCreateNewProject({ description: 'A timer' })}>Create repo</button>
  </>,
}))

function makeProps() {
  return {
    visible: true,
    currentWorkspace: { id: 'w1', name: 'Checkout redesign' },
    onAddProject: vi.fn(),
    onCloneProject: vi.fn().mockResolvedValue(true),
    onCreateNewProject: vi.fn().mockResolvedValue(true),
    creatingProject: false,
    cloningProject: false,
    createError: null,
    onClose: vi.fn(),
  }
}

describe('repository destination', () => {
  it('names the current workspace and routes every add path to it when selected', () => {
    const props = makeProps()
    render(<AddRepositoryModal {...props} />)
    expect(screen.queryByText('Open local')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Current workspace\s*Checkout redesign/ }))
    fireEvent.click(screen.getByText('Open local'))
    fireEvent.click(screen.getByText('Clone'))
    fireEvent.click(screen.getByText('Create repo'))
    expect(props.onAddProject).toHaveBeenCalledWith('w1')
    expect(props.onCloneProject).toHaveBeenCalledWith('https://example.com/repo.git', 'w1')
    expect(props.onCreateNewProject).toHaveBeenCalledWith({ description: 'A timer' }, 'w1')
  })

  it('offers a new workspace even when one is open and resets on reopening', () => {
    const props = makeProps()
    const { rerender } = render(<AddRepositoryModal {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /New workspace\s*Start a separate/ }))
    fireEvent.click(screen.getByText('Open local'))
    expect(props.onAddProject).toHaveBeenCalledWith(undefined)
    rerender(<AddRepositoryModal {...props} visible={false} />)
    rerender(<AddRepositoryModal {...props} />)
    expect(screen.getByRole('button', { name: /Current workspace\s*Checkout redesign/ })).toBeInTheDocument()
    expect(screen.queryByText('Open local')).not.toBeInTheDocument()
  })

  it('disables the current-workspace card when none is open', () => {
    render(<AddRepositoryModal {...makeProps()} currentWorkspace={undefined} />)
    expect(screen.getByRole('button', { name: /Current workspace\s*No workspace is open/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /New workspace\s*Start a separate/ })).toBeEnabled()
  })

  it('returns to the two cards and lets the user change destination', () => {
    const props = makeProps()
    render(<AddRepositoryModal {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Current workspace\s*Checkout redesign/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Change workspace' }))
    expect(screen.queryByText('Open local')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /New workspace\s*Start a separate/ }))
    fireEvent.click(screen.getByText('Open local'))
    expect(props.onAddProject).toHaveBeenCalledWith(undefined)
  })
})
