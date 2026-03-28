import { execFile } from 'node:child_process'

/**
 * GitHub repo names may only contain alphanumeric characters, hyphens,
 * underscores, and periods.  When you pass an invalid name to `gh repo create`,
 * GitHub silently sanitizes it (e.g. replacing `&` with `-`).  We must apply
 * the same sanitization locally so the clone URL we construct matches the
 * actual repo name GitHub created.
 *
 * Invalid characters are replaced with hyphens, consecutive hyphens are
 * collapsed, and leading/trailing hyphens and periods are stripped.
 * Throws if the name reduces to an empty string after sanitization.
 */
export function sanitizeGitHubRepoName(name: string): string {
  const sanitized = name
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')

  if (!sanitized) {
    throw new Error(
      `Repository name "${name}" contains no valid characters. ` +
      'Names must include at least one alphanumeric character, underscore, or period.',
    )
  }
  return sanitized
}

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
  const safeName = sanitizeGitHubRepoName(name)
  const fullName = `${resolvedOwner}/${safeName}`

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
