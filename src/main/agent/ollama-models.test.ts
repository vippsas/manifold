import { describe, it, expect, vi } from 'vitest'

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn()
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    default: { ...actual, execFile: mockExecFile },
    execFile: mockExecFile
  }
})

import { listOllamaModels } from './ollama-models'

describe('listOllamaModels', () => {
  it('parses model names from ollama list output', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], callback: any) => {
      callback(
        null,
        'NAME                    ID              SIZE      MODIFIED\nqwen3:8b                abc123          4.9 GB    2 hours ago\nglm-4.7-flash:latest    def456          17 GB     3 days ago\n',
        ''
      )
      return {} as any
    })

    const models = await listOllamaModels()
    expect(models).toEqual(['qwen3:8b', 'glm-4.7-flash:latest'])
  })

  it('returns empty array when ollama is not installed', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], callback: any) => {
      callback(new Error('command not found'), '', '')
      return {} as any
    })

    const models = await listOllamaModels()
    expect(models).toEqual([])
  })

  it('returns empty array when ollama list returns no models', async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], callback: any) => {
      callback(null, 'NAME    ID    SIZE    MODIFIED\n', '')
      return {} as any
    })

    const models = await listOllamaModels()
    expect(models).toEqual([])
  })
})
