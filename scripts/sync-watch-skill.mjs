// One-shot copy of the /watch skill from a configurable upstream path
// into resources/skills/watch/. Usage:
//   node scripts/sync-watch-skill.mjs [upstream-path]
// Defaults to ../claude-video relative to repo root.
import * as fs from 'node:fs'
import * as path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')
const src = path.resolve(process.argv[2] ?? path.join(repoRoot, '..', 'claude-video'))
const dst = path.join(repoRoot, 'resources', 'skills', 'watch')

const INCLUDE = ['commands', 'scripts', 'hooks', 'SKILL.md', '.claude-plugin']

function copyAll(s, d) {
  fs.mkdirSync(d, { recursive: true })
  for (const entry of fs.readdirSync(s, { withFileTypes: true })) {
    const sp = path.join(s, entry.name)
    const dp = path.join(d, entry.name)
    if (entry.isDirectory()) copyAll(sp, dp)
    else if (entry.isFile()) fs.copyFileSync(sp, dp)
  }
}

if (!fs.existsSync(src)) {
  console.error(`upstream path not found: ${src}`)
  process.exit(1)
}
fs.rmSync(dst, { recursive: true, force: true })
fs.mkdirSync(dst, { recursive: true })
for (const name of INCLUDE) {
  const sp = path.join(src, name)
  if (!fs.existsSync(sp)) continue
  const stat = fs.statSync(sp)
  if (stat.isDirectory()) copyAll(sp, path.join(dst, name))
  else fs.copyFileSync(sp, path.join(dst, name))
}
const pluginJsonSrc = path.join(src, '.claude-plugin', 'plugin.json')
if (fs.existsSync(pluginJsonSrc)) fs.copyFileSync(pluginJsonSrc, path.join(dst, 'plugin.json'))
console.log(`watch skill synced: ${src} -> ${dst}`)
