import { chmodSync, copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const RELEASE_SCRIPT = resolve('release.sh')

describe('release.sh publish preflights', () => {
  let root: string
  let bin: string
  let log: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'mf-release-'))
    bin = join(root, 'bin')
    log = join(root, 'commands.log')
    mkdirSync(bin)
    copyFileSync(RELEASE_SCRIPT, join(root, 'release.sh'))
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }))

    writeExecutable(
      join(bin, 'git'),
      `#!/usr/bin/env bash
printf 'git %s\\n' "$*" >> "$TEST_COMMAND_LOG"
case "$1" in
  diff|ls-files|remote|fetch|tag|push)
    exit 0
    ;;
  rev-parse)
    if [[ "$2" == "--show-toplevel" ]]; then
      printf '%s\\n' "$TEST_REPO_ROOT"
      exit 0
    fi
    if [[ "$2" == "origin/main" ]]; then
      printf '0123456789abcdef0123456789abcdef01234567\\n'
      exit 0
    fi
    exit 1
    ;;
  show)
    printf '{"version":"1.2.3"}\\n'
    exit 0
    ;;
  ls-remote)
    exit 2
    ;;
esac
exit 1
`,
    )

    writeExecutable(
      join(bin, 'gh'),
      `#!/usr/bin/env bash
printf 'gh %s\\n' "$*" >> "$TEST_COMMAND_LOG"
if [[ "$1" == "auth" && "$2" == "token" ]]; then
  exit "\${GH_AUTH_TOKEN_STATUS:-0}"
fi
if [[ "$1" == "api" ]]; then
  case "$GH_RELEASE_STATUS" in
    200)
      printf 'HTTP/2.0 200 OK\\n'
      exit 0
      ;;
    404)
      printf 'HTTP/2.0 404 Not Found\\n'
      exit 1
      ;;
    *)
      printf 'HTTP/2.0 403 Forbidden\\n'
      exit 1
      ;;
  esac
fi
if [[ "$1" == "release" && "$2" == "create" ]]; then
  printf 'https://github.test/releases/tag/v1.2.3\\n'
  exit 0
fi
exit 1
`,
    )

    writeExecutable(join(bin, 'npm'), '#!/usr/bin/env bash\nexit 0\n')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('uses the stored token and publishes after a confirmed 404', () => {
    const result = runRelease({ GH_RELEASE_STATUS: '404' })
    const commands = readFileSync(log, 'utf8')

    expect(result.status).toBe(0)
    expect(commands).toContain('gh auth token')
    expect(commands).not.toContain('gh auth status')
    expect(commands).toContain('git tag -a v1.2.3')
    expect(commands).toContain('git push origin v1.2.3')
    expect(commands).toContain('gh release create v1.2.3 --verify-tag --generate-notes')
  })

  it('stops before tagging when the release check does not return 404', () => {
    const result = runRelease({ GH_RELEASE_STATUS: '403' })
    const commands = readFileSync(log, 'utf8')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("unable to verify whether GitHub release 'v1.2.3' exists")
    expect(result.stderr).toContain('HTTP/2.0 403 Forbidden')
    expect(commands).not.toContain('git tag -a')
    expect(commands).not.toContain('git push origin v1.2.3')
  })

  it('stops when no stored GitHub token is available', () => {
    const result = runRelease({ GH_AUTH_TOKEN_STATUS: '1', GH_RELEASE_STATUS: '404' })
    const commands = readFileSync(log, 'utf8')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('GitHub CLI has no authentication token')
    expect(commands).not.toContain('git fetch')
  })

  function runRelease(overrides: Record<string, string>) {
    return spawnSync('bash', [join(root, 'release.sh'), 'publish'], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...overrides,
        PATH: `${bin}${delimiter}${process.env.PATH}`,
        TEST_COMMAND_LOG: log,
        TEST_REPO_ROOT: root,
      },
    })
  }
})

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, contents)
  chmodSync(path, 0o755)
}
