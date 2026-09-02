import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createViolaGates } from './gates'

const dirs: string[] = []

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'viola-gate-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('createViolaGates', () => {
  it('reports exit 0 as green with the command output', async () => {
    const result = await createViolaGates().run(scratch(), 'echo gate-ok', new AbortController().signal)
    expect(result).toEqual({ ok: true, output: 'gate-ok\n' })
  })

  it('reports a non-zero exit as red and keeps stderr for the fix prompt', async () => {
    const result = await createViolaGates().run(scratch(), 'echo broken >&2; exit 3', new AbortController().signal)
    expect(result.ok).toBe(false)
    expect(result.output).toContain('broken')
  })

  it('runs from the worktree root', async () => {
    const dir = scratch()
    const result = await createViolaGates().run(dir, 'pwd', new AbortController().signal)
    expect(result.output.trim().endsWith(dir.split('/').pop()!)).toBe(true)
  })

  it('stops a running gate when Viola is stopped', async () => {
    const abort = new AbortController()
    const pending = createViolaGates().run(scratch(), 'sleep 30', abort.signal)
    abort.abort()
    const result = await pending
    expect(result.ok).toBe(false)
    expect(result.output).toContain('aborted')
  })
})
