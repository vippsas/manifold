import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFileOperations } from './useFileOperations'

function makeDeps() {
  return {
    expandAncestors: vi.fn<(filePath: string) => void>(),
    codeViewSelectFile: vi.fn<(filePath: string, preferredPaneId?: string | null) => string>().mockReturnValue('pane-1'),
    codeViewCloseFile: vi.fn<(filePath: string) => void>(),
    codeViewRenameOpenFile: vi.fn<(oldPath: string, newPath: string) => void>(),
    ensureEditorVisible: vi.fn<(preferredPaneId?: string | null) => string>().mockReturnValue('pane-1'),
    deleteFile: vi.fn<(filePath: string) => Promise<boolean>>().mockResolvedValue(true),
    renameFile: vi.fn<(oldPath: string, newPath: string) => Promise<boolean>>().mockResolvedValue(true),
    createFile: vi.fn<(dirPath: string, fileName: string) => Promise<boolean>>().mockResolvedValue(true),
    createDir: vi.fn<(dirPath: string, dirName: string) => Promise<boolean>>().mockResolvedValue(true),
    importPaths: vi.fn<(dirPath: string, sourcePaths: string[]) => Promise<string | null>>().mockResolvedValue(null),
    movePath: vi.fn<(sourcePath: string, targetDir: string, overwrite?: boolean) => Promise<string | null>>().mockResolvedValue(null),
    revealInFinder: vi.fn<(filePath: string) => Promise<void>>().mockResolvedValue(undefined),
    openInTerminal: vi.fn<(dirPath: string) => Promise<void>>().mockResolvedValue(undefined),
  }
}

function setup(deps: ReturnType<typeof makeDeps>) {
  return renderHook(() =>
    useFileOperations(
      deps.expandAncestors,
      deps.codeViewSelectFile,
      deps.codeViewCloseFile,
      deps.codeViewRenameOpenFile,
      deps.ensureEditorVisible,
      deps.deleteFile,
      deps.renameFile,
      deps.createFile,
      deps.createDir,
      deps.importPaths,
      deps.movePath,
      deps.revealInFinder,
      deps.openInTerminal,
    )
  )
}

describe('useFileOperations.handleCreateFile', () => {
  it('opens the newly created file in the editor on success', async () => {
    const deps = makeDeps()
    const { result } = setup(deps)
    await act(async () => {
      await result.current.handleCreateFile('/root/src', 'foo.txt')
    })
    expect(deps.createFile).toHaveBeenCalledWith('/root/src', 'foo.txt')
    expect(deps.codeViewSelectFile).toHaveBeenCalledWith('/root/src/foo.txt', 'pane-1')
  })

  it('does not open anything when creation fails (e.g. file already exists)', async () => {
    const deps = makeDeps()
    deps.createFile.mockResolvedValue(false)
    const { result } = setup(deps)
    await act(async () => {
      await result.current.handleCreateFile('/root/src', 'foo.txt')
    })
    expect(deps.codeViewSelectFile).not.toHaveBeenCalled()
  })

  it('returns the underlying create result', async () => {
    const deps = makeDeps()
    deps.createFile.mockResolvedValue(false)
    const { result } = setup(deps)
    let returned: boolean | undefined
    await act(async () => {
      returned = await result.current.handleCreateFile('/root/src', 'foo.txt')
    })
    expect(returned).toBe(false)
  })

  it('does not open an editor when a directory is created', async () => {
    const deps = makeDeps()
    const { result } = setup(deps)
    await act(async () => {
      await result.current.handleCreateDir('/root', 'newdir')
    })
    expect(deps.codeViewSelectFile).not.toHaveBeenCalled()
  })
})
