import { execFile } from 'node:child_process'

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 30_000 }, (error, stdout, stderr) => {
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
