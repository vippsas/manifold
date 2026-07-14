import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve('install-linux.sh')
const bashAvailable = spawnSync('bash', ['-c', 'exit 0']).status === 0
const describeIfBash = bashAvailable ? describe : describe.skip

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

// A project stand-in: a fake HOME, a no-op `npm` on PATH (so `dist:linux` /
// `verify:linux-package` succeed), and a pre-built dist/linux-unpacked whose
// `manifold` executable carries `marker` so we can tell versions apart.
async function makeProject(marker: string): Promise<{ project: string; home: string; env: NodeJS.ProcessEnv }> {
  const base = await mkdtemp(join(tmpdir(), 'manifold-install-test-'))
  roots.push(base)
  const project = join(base, 'project')
  const home = join(base, 'home')
  const binStub = join(base, 'bin')
  await mkdir(join(project, 'dist', 'linux-unpacked'), { recursive: true })
  await mkdir(home, { recursive: true })
  await mkdir(binStub, { recursive: true })

  const exe = join(project, 'dist', 'linux-unpacked', 'manifold')
  await writeFile(exe, `#!/bin/bash\necho ${marker}\n`)
  await chmod(exe, 0o755)

  const npmStub = join(binStub, 'npm')
  await writeFile(npmStub, '#!/bin/bash\nexit 0\n')
  await chmod(npmStub, 0o755)

  return { project, home, env: { ...process.env, HOME: home, PATH: `${binStub}:/usr/bin:/bin` } }
}

function run(script: string, project: string, env: NodeJS.ProcessEnv) {
  return spawnSync('bash', [script], { cwd: project, env, encoding: 'utf8', timeout: 30_000 })
}

describeIfBash('install-linux.sh', () => {
  it('installs the app and a launcher into the fake HOME', async () => {
    const { project, home, env } = await makeProject('v1')
    const result = run(SCRIPT, project, env)

    expect(result.status).toBe(0)
    const app = join(home, '.local/share/manifold/manifold')
    const wrapper = join(home, '.local/bin/manifold')
    expect((await stat(app)).isFile()).toBe(true)
    expect(await readFile(app, 'utf8')).toContain('v1')
    expect(await readFile(wrapper, 'utf8')).toContain('.local/share/manifold/manifold')
  })

  it('replaces an existing install on upgrade', async () => {
    const { project, home, env } = await makeProject('v1')
    expect(run(SCRIPT, project, env).status).toBe(0)

    // Second build carries a new marker; reuse the same HOME.
    const exe = join(project, 'dist', 'linux-unpacked', 'manifold')
    await writeFile(exe, '#!/bin/bash\necho v2\n')
    await chmod(exe, 0o755)
    expect(run(SCRIPT, project, env).status).toBe(0)

    expect(await readFile(join(home, '.local/share/manifold/manifold'), 'utf8')).toContain('v2')
  })

  it('preserves an existing install when the build output is invalid', async () => {
    const { project, home, env } = await makeProject('v1')
    expect(run(SCRIPT, project, env).status).toBe(0)

    // Corrupt the staged executable so the pre-replacement check fails.
    await chmod(join(project, 'dist', 'linux-unpacked', 'manifold'), 0o644)
    const result = run(SCRIPT, project, env)

    expect(result.status).not.toBe(0)
    // The prior good install must survive the failed run.
    expect(await readFile(join(home, '.local/share/manifold/manifold'), 'utf8')).toContain('v1')
  })
})
