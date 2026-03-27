import { execFile } from 'node:child_process'

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 30_000, env: { ...process.env, GH_NO_UPDATE_NOTIFIER: '1' } }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message))
        return
      }
      resolve(stdout.trim())
    })
  })
}

export async function getAuthenticatedUser(): Promise<string> {
  return run('gh', ['api', 'user', '--jq', '.login'])
}

async function waitForTemplateReady(fullName: string, timeoutMs = 30_000, intervalMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await run('gh', ['api', `repos/${fullName}/commits`, '--jq', '.[0].sha', '-q'])
      return
    } catch {
      // Template content not ready yet — repo is still empty.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  // Timed out waiting, but proceed anyway — the clone will get whatever state exists.
}

export async function createRepoFromTemplate(
  templateRepo: string,
  name: string,
  owner?: string,
): Promise<{ repoUrl: string; fullName: string }> {
  const resolvedOwner = owner?.trim() || (await getAuthenticatedUser())
  const fullName = `${resolvedOwner}/${name}`

  await run('gh', [
    'repo',
    'create',
    fullName,
    '--template',
    templateRepo,
    '--private',
    '--confirm',
  ])

  await waitForTemplateReady(fullName)

  return {
    repoUrl: `git@github.com:${fullName}.git`,
    fullName,
  }
}

export async function checkGhCli(): Promise<{ authenticated: boolean; user?: string; error?: string }> {
  try {
    await run('gh', ['--version'])
  } catch {
    return { authenticated: false, error: 'gh CLI is not installed or not in PATH' }
  }

  try {
    const user = await getAuthenticatedUser()
    return { authenticated: true, user }
  } catch {
    return { authenticated: false, error: 'gh CLI is not authenticated. Run: gh auth login' }
  }
}
