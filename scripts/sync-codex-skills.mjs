// Copy the checked-in skills into Codex's installed skill root.
// The Codex copy of gh-create-issue needs its helper command pointed at the
// installed script path, not the repo's .claude source path.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = resolve(HERE, '..')
const ISSUE_UPLOAD_COMMAND = 'bash .claude/skills/gh-create-issue/scripts/upload-assets.sh <path> [<path>...]'

export function defaultCodexSkillsRoot() {
  const codexHome = process.env.CODEX_HOME
    ? resolve(process.env.CODEX_HOME)
    : join(homedir(), '.codex')
  return join(codexHome, 'skills')
}

export function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

export function syncCodexSkills({
  repoRoot = DEFAULT_REPO_ROOT,
  targetRoot = defaultCodexSkillsRoot(),
} = {}) {
  const sourceRoot = join(repoRoot, '.claude', 'skills')
  if (!existsSync(sourceRoot)) {
    throw new Error(`source skills root missing: ${sourceRoot}`)
  }

  mkdirSync(targetRoot, { recursive: true })

  const installed = []
  for (const skill of listSkillNames(sourceRoot)) {
    const source = join(sourceRoot, skill)
    const target = join(targetRoot, skill)

    rmSync(target, { recursive: true, force: true })
    cpSync(source, target, { recursive: true })
    adaptCodexSkill(skill, target)
    installed.push(target)
  }

  return installed
}

function listSkillNames(sourceRoot) {
  return readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

function adaptCodexSkill(skill, target) {
  if (skill !== 'gh-create-issue') return

  const skillPath = join(target, 'SKILL.md')
  const uploadScript = join(target, 'scripts', 'upload-assets.sh')
  const contents = readFileSync(skillPath, 'utf8')
  if (!contents.includes(ISSUE_UPLOAD_COMMAND)) {
    throw new Error('gh-create-issue text drifted; update the Codex rewrite token')
  }

  writeFileSync(
    skillPath,
    contents.replace(
      ISSUE_UPLOAD_COMMAND,
      `bash ${shellQuote(uploadScript)} <path> [<path>...]`,
    ),
    'utf8',
  )
}

function parseArgs(argv) {
  const opts = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--target-root') {
      const value = argv[i + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('--target-root requires a path')
      }
      opts.targetRoot = resolve(value)
      i += 1
    } else if (arg === '-h' || arg === '--help') {
      opts.help = true
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }
  return opts
}

function printUsage() {
  console.log('Usage: node scripts/sync-codex-skills.mjs [--target-root <path>]')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const opts = parseArgs(process.argv.slice(2))
    if (opts.help) {
      printUsage()
      process.exit(0)
    }
    const installed = syncCodexSkills(opts)
    for (const target of installed) {
      console.log(`synced ${target}`)
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    printUsage()
    process.exit(1)
  }
}
