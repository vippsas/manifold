import { afterEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { parseEnvFile, loadAgentEnv, agentSpawnEnv } from './agent-env'

const tmpFiles: string[] = []

function writeTmpEnv(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-env-'))
  const file = path.join(dir, 'agent.env')
  fs.writeFileSync(file, contents)
  tmpFiles.push(file)
  return file
}

afterEach(() => {
  while (tmpFiles.length) {
    const f = tmpFiles.pop()!
    fs.rmSync(path.dirname(f), { recursive: true, force: true })
  }
})

describe('parseEnvFile', () => {
  it('parses a basic KEY=VALUE line', () => {
    expect(parseEnvFile('FOO=bar')).toEqual({ FOO: 'bar' })
  })

  it('strips surrounding double quotes', () => {
    expect(parseEnvFile('FOO="bar baz"')).toEqual({ FOO: 'bar baz' })
  })

  it('strips surrounding single quotes', () => {
    expect(parseEnvFile("FOO='bar baz'")).toEqual({ FOO: 'bar baz' })
  })

  it('trims whitespace around key and value', () => {
    expect(parseEnvFile('  FOO   =   bar  ')).toEqual({ FOO: 'bar' })
  })

  it('ignores blank lines and # comments', () => {
    const contents = '# a comment\n\nFOO=bar\n   # indented comment\nBAZ=qux\n'
    expect(parseEnvFile(contents)).toEqual({ FOO: 'bar', BAZ: 'qux' })
  })

  it('keeps = characters inside the value', () => {
    expect(parseEnvFile('TOKEN=a=b=c')).toEqual({ TOKEN: 'a=b=c' })
  })

  it('ignores lines without = and lines with an empty key', () => {
    expect(parseEnvFile('NOEQUALS\n=novalue\nFOO=bar')).toEqual({ FOO: 'bar' })
  })

  it('parses multiple lines including a realistic key', () => {
    const contents = 'AZURE_OPENAI_API_KEY="sk-test-123"\nOTHER=1\n'
    expect(parseEnvFile(contents)).toEqual({ AZURE_OPENAI_API_KEY: 'sk-test-123', OTHER: '1' })
  })
})

describe('loadAgentEnv', () => {
  it('reads and parses an existing file', () => {
    const file = writeTmpEnv('FOO=bar\nBAZ="qux"\n')
    expect(loadAgentEnv(file)).toEqual({ FOO: 'bar', BAZ: 'qux' })
  })

  it('returns {} when the file does not exist', () => {
    expect(loadAgentEnv(path.join(os.tmpdir(), 'definitely-missing-agent.env'))).toEqual({})
  })

  it('returns {} for an empty file', () => {
    const file = writeTmpEnv('')
    expect(loadAgentEnv(file)).toEqual({})
  })
})

describe('agentSpawnEnv', () => {
  it('returns file vars when the file has them', () => {
    const file = writeTmpEnv('AZURE_OPENAI_API_KEY=k\n')
    expect(agentSpawnEnv(undefined, file)).toEqual({ AZURE_OPENAI_API_KEY: 'k' })
  })

  it('lets runtimeEnv override file values', () => {
    const file = writeTmpEnv('FOO=fromfile\n')
    expect(agentSpawnEnv({ FOO: 'fromruntime' }, file)).toEqual({ FOO: 'fromruntime' })
  })

  it('returns undefined when the file is missing and no runtime env', () => {
    const missing = path.join(os.tmpdir(), 'definitely-missing-agent.env')
    expect(agentSpawnEnv(undefined, missing)).toBeUndefined()
  })

  it('returns runtimeEnv when there is no file', () => {
    const missing = path.join(os.tmpdir(), 'definitely-missing-agent.env')
    expect(agentSpawnEnv({ A: '1' }, missing)).toEqual({ A: '1' })
  })
})
