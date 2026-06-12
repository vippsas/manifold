import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { shellPromptSegmentsFilePath, writeShellPromptSegmentsFile } from './shell-prompt-config'
import { createManifoldZdotdir } from './shell-prompt'

describe('shellPromptSegmentsFilePath', () => {
  it('points at the shared segments file next to config.json', () => {
    expect(shellPromptSegmentsFilePath()).toBe(
      path.join(os.homedir(), '.manifold', 'shell-prompt-segments.zsh'),
    )
  })
})

describe('writeShellPromptSegmentsFile', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-seg-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes a zsh assignment for every segment toggle', () => {
    const file = path.join(tmpDir, 'segments.zsh')
    writeShellPromptSegmentsFile(
      { repo: true, agent: false, k8sContext: true, k8sNamespace: false },
      file,
    )
    const content = fs.readFileSync(file, 'utf-8')
    expect(content).toContain('_manifold_seg_repo=1')
    expect(content).toContain('_manifold_seg_agent=0')
    expect(content).toContain('_manifold_seg_k8s_ctx=1')
    expect(content).toContain('_manifold_seg_k8s_ns=0')
  })

  it('creates the parent directory when missing', () => {
    const file = path.join(tmpDir, 'nested', 'segments.zsh')
    writeShellPromptSegmentsFile(
      { repo: true, agent: true, k8sContext: false, k8sNamespace: false },
      file,
    )
    expect(fs.existsSync(file)).toBe(true)
  })
})

describe('live prompt segment updates', () => {
  const zshAvailable = spawnSync('zsh', ['-fc', 'exit 0']).status === 0
  const itIfZsh = zshAvailable ? it : it.skip
  const originalZdotdir = process.env.ZDOTDIR
  let tmpDir: string
  let zdotdir: string | null = null

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifold-seg-live-'))
    const userZdotdir = path.join(tmpDir, 'user-zdotdir')
    fs.mkdirSync(userZdotdir)
    fs.writeFileSync(path.join(userZdotdir, '.zshrc'), '', 'utf-8')
    process.env.ZDOTDIR = userZdotdir
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    if (zdotdir) {
      fs.rmSync(zdotdir, { recursive: true, force: true })
      zdotdir = null
    }
    if (originalZdotdir === undefined) {
      delete process.env.ZDOTDIR
    } else {
      process.env.ZDOTDIR = originalZdotdir
    }
  })

  itIfZsh('an existing shell picks up changed segments at the next prompt refresh', () => {
    const segmentsFile = path.join(tmpDir, 'segments.zsh')
    // Stage the post-save segments (agent disabled) without touching the live
    // path yet — the copy below simulates a settings save mid-shell-lifetime.
    const staged = path.join(tmpDir, 'staged.zsh')
    writeShellPromptSegmentsFile(
      { repo: true, agent: false, k8sContext: false, k8sNamespace: false },
      staged,
    )

    zdotdir = createManifoldZdotdir({
      agentName: 'oslo',
      repoName: 'myproject',
      segments: { repo: true, agent: true, k8sContext: false, k8sNamespace: false },
      segmentsFile,
    })

    const script = [
      'print -r -- "before=$PROMPT"',
      `command cp "${staged}" "${segmentsFile}"`,
      '_manifold_prompt_refresh',
      'print -r -- "after=$PROMPT"',
    ].join('; ')
    const result = spawnSync('zsh', ['-i', '-c', script], {
      env: { ...process.env, ZDOTDIR: zdotdir },
      encoding: 'utf-8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('before=%F{16}myproject%f [oslo] %F{white}❯%f ')
    expect(result.stdout).toContain('after=%F{16}myproject%f %F{white}❯%f ')
  })

  itIfZsh('a shell spawned next to an existing segments file follows the file', () => {
    const segmentsFile = path.join(tmpDir, 'segments.zsh')
    writeShellPromptSegmentsFile(
      { repo: false, agent: true, k8sContext: false, k8sNamespace: false },
      segmentsFile,
    )

    zdotdir = createManifoldZdotdir({
      agentName: 'oslo',
      repoName: 'myproject',
      segments: { repo: true, agent: true, k8sContext: false, k8sNamespace: false },
      segmentsFile,
    })

    const result = spawnSync('zsh', ['-i', '-c', 'print -r -- "prompt=$PROMPT"'], {
      env: { ...process.env, ZDOTDIR: zdotdir },
      encoding: 'utf-8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('prompt=%F{16}oslo%f %F{white}❯%f ')
  })
})
