import React from 'react'
import { vi } from 'vitest'
import { render, type RenderResult } from '@testing-library/react'
import type { OpenFile } from '../../../hooks/useCodeView'
import { CodeViewer } from './CodeViewer'
import type { FileOpenRequest } from '../file-open-request'

export function makeOpenFile(overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    path: '/repo/file.ts',
    content: 'const value = 1',
    refreshVersion: 0,
    ...overrides,
  }
}

export function makeOpenRequest(overrides: Partial<FileOpenRequest> = {}): FileOpenRequest {
  return {
    path: null,
    source: 'default',
    ...overrides,
  }
}

export function renderViewer(overrides: Partial<React.ComponentProps<typeof CodeViewer>> = {}): RenderResult {
  const openFile = makeOpenFile()
  const props: React.ComponentProps<typeof CodeViewer> = {
    sessionId: 'session-1',
    fileDiffText: null,
    originalContent: null,
    openFiles: [openFile],
    activeFilePath: openFile.path,
    fileContent: openFile.content,
    lastFileOpenRequest: makeOpenRequest(),
    theme: 'manifold-dark',
    onSelectTab: vi.fn(),
    onOpenLinkedFile: vi.fn(),
    onCloseTab: vi.fn(),
    onSaveFile: vi.fn(),
    ...overrides,
  }

  return render(<CodeViewer {...props} />)
}
