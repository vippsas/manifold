// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { shellQuote, syncCodexSkills } from './sync-codex-skills.mjs'

let targetRoot: string

beforeEach(() => {
  targetRoot = mkdtempSync(join(tmpdir(), 'mf-codex-skills-'))
})

afterEach(() => {
  rmSync(targetRoot, { recursive: true, force: true })
})

function checkedInSkillNames(): string[] {
  return readdirSync(join(process.cwd(), '.claude', 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

describe('syncCodexSkills', () => {
  it('copies every checked-in skill into the Codex skill root', () => {
    const installed = syncCodexSkills({ repoRoot: process.cwd(), targetRoot })
    const skillNames = checkedInSkillNames()

    expect(installed).toEqual(skillNames.map((skill) => join(targetRoot, skill)))
    for (const skill of skillNames) {
      expect(existsSync(join(targetRoot, skill, 'SKILL.md'))).toBe(true)
    }
  })

  it('preserves Codex skills that are not managed by this repo', () => {
    const customSkill = join(targetRoot, 'custom-local-skill')
    mkdirSync(customSkill, { recursive: true })
    writeFileSync(join(customSkill, 'SKILL.md'), '# custom')

    syncCodexSkills({ repoRoot: process.cwd(), targetRoot })

    expect(readFileSync(join(customSkill, 'SKILL.md'), 'utf8')).toBe('# custom')
  })

  it('rewrites the issue upload helper command to the installed Codex path', () => {
    syncCodexSkills({ repoRoot: process.cwd(), targetRoot })

    const issueSkill = readFileSync(join(targetRoot, 'gh-create-issue', 'SKILL.md'), 'utf8')
    const uploadScript = join(targetRoot, 'gh-create-issue', 'scripts', 'upload-assets.sh')

    expect(issueSkill).toContain(`bash ${shellQuote(uploadScript)} <path> [<path>...]`)
    expect(issueSkill).not.toContain('bash .claude/skills/gh-create-issue/scripts/upload-assets.sh')
  })

  it('leaves the source Claude skill pointed at the checked-in helper path', () => {
    syncCodexSkills({ repoRoot: process.cwd(), targetRoot })

    const sourceSkill = readFileSync(join(process.cwd(), '.claude', 'skills', 'gh-create-issue', 'SKILL.md'), 'utf8')
    expect(sourceSkill).toContain('bash .claude/skills/gh-create-issue/scripts/upload-assets.sh')
  })
})
