// scripts/generate-seti-icons.mjs — regenerates src/renderer/components/editor/file-tree/seti-icon-data.ts
//
// Manifold's file tree uses VS Code's default file icon theme (Seti). VS Code resolves an icon
// from two data sources that live in different places in its repo:
//
//   1. extensions/theme-seti/icons/vs-seti-icon-theme.json — glyph + colour per icon id, and the
//      fileNames / fileExtensions / languageIds maps that point at those ids.
//   2. extensions/*/package.json `contributes.languages` — the filename/pattern/extension →
//      languageId associations. These matter because Seti deliberately maps the *common*
//      types (ts, js, py, go, md, json, …) by languageId, not by extension.
//
// This script flattens both into one checked-in TS module so the renderer needs no VS Code
// checkout at build time. Run it against a VS Code checkout to pick up upstream changes:
//
//   node scripts/generate-seti-icons.mjs [--vscode ../vscode]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')
const OUT_FILE = resolve(REPO_ROOT, 'src/renderer/components/editor/file-tree/seti-icon-data.ts')

function parseArgs(argv) {
  let vscode = resolve(REPO_ROOT, '..', 'vscode')
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--vscode') vscode = resolve(argv[++i])
  }
  return { vscode }
}

/** Read the Seti icon theme document shipped by VS Code's built-in theme-seti extension. */
function readSetiTheme(vscodeRoot) {
  const path = join(vscodeRoot, 'extensions/theme-seti/icons/vs-seti-icon-theme.json')
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Collect `contributes.languages` from every built-in extension, keeping only the languages
 *  Seti actually has an icon for — the rest resolve to the default glyph either way. */
function readLanguageAssociations(vscodeRoot, setiLanguageIds) {
  const byFileName = {}
  const byExtension = {}
  const patterns = []
  const skippedExtensions = []

  const extensionsDir = join(vscodeRoot, 'extensions')
  for (const entry of readdirSync(extensionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    let pkg
    try {
      pkg = JSON.parse(readFileSync(join(extensionsDir, entry.name, 'package.json'), 'utf8'))
    } catch {
      continue
    }
    for (const language of pkg.contributes?.languages ?? []) {
      if (!setiLanguageIds.has(language.id)) continue
      for (const name of language.filenames ?? []) byFileName[name.toLowerCase()] = language.id
      for (const ext of language.extensions ?? []) {
        // The resolver matches extensions at dot boundaries, so a suffix registered without a
        // leading dot (e.g. `language-configuration.json`) can't be looked up. Those all end in
        // a normal extension that resolves to the same icon, so dropping them is a no-op.
        if (!ext.startsWith('.')) {
          skippedExtensions.push(`${language.id}: ${ext}`)
          continue
        }
        byExtension[ext.toLowerCase()] = language.id
      }
      for (const pattern of language.filenamePatterns ?? []) {
        // VS Code matches patterns containing a separator against the whole path. The tree
        // resolves icons from the base name alone, so those patterns can never match here.
        if (pattern.includes('/')) continue
        patterns.push([pattern.toLowerCase(), language.id])
      }
    }
  }

  if (skippedExtensions.length) {
    console.warn(`[seti] skipped dotless language extensions: ${skippedExtensions.join(', ')}`)
  }

  // VS Code prefers the longest pattern match; pre-sort so the resolver can take the first hit.
  patterns.sort((a, b) => b[0].length - a[0].length)
  return { byFileName, byExtension, patterns }
}

/** The theme stores glyphs as CSS escapes (`\E001`) because VS Code injects them into a
 *  `content:` declaration. We render them as text, so resolve them to the real character. */
function decodeFontCharacter(fontCharacter) {
  const match = fontCharacter.match(/^\\([0-9a-fA-F]{1,6})$/)
  if (!match) throw new Error(`Unexpected Seti fontCharacter ${JSON.stringify(fontCharacter)}`)
  return String.fromCodePoint(parseInt(match[1], 16))
}

/** Icon definitions, keyed by the dark id, carrying the light-theme colour alongside.
 *  Seti names every light variant `<id>_light` (the sole exception, `_todo`, has no light
 *  variant and reuses its dark colour). */
function buildDefinitions(theme) {
  const defs = {}
  for (const [id, def] of Object.entries(theme.iconDefinitions)) {
    if (id.endsWith('_light')) continue
    const light = theme.iconDefinitions[`${id}_light`] ?? def
    // A definition without a colour (only `_todo`) emits no `color` rule in VS Code, so the
    // glyph inherits the row's text colour — `currentColor` says exactly that.
    defs[id] = [
      decodeFontCharacter(def.fontCharacter),
      def.fontColor ?? 'currentColor',
      light.fontColor ?? 'currentColor',
    ]
  }
  return defs
}

// ── Serialisation ──────────────────────────────────────────────────

const q = (s) => JSON.stringify(s)

function stringMap(name, type, entries) {
  const body = Object.entries(entries).map(([k, v]) => `  ${q(k)}: ${q(v)},`).join('\n')
  return `export const ${name}: ${type} = {\n${body}\n}\n`
}

function generate({ theme, langs }) {
  const defs = buildDefinitions(theme)
  const defEntries = Object.entries(defs)
    .map(([id, [char, dark, light]]) => `  ${q(id)}: [${q(char)}, ${q(dark)}, ${q(light)}],`)
    .join('\n')

  return `// AUTO-GENERATED by scripts/generate-seti-icons.mjs — do not edit by hand.
// Source: VS Code's built-in Seti file icon theme (extensions/theme-seti) plus the
// \`contributes.languages\` associations of its built-in language extensions.
// Seti UI icons © 2014 Jesse Weed (MIT); see src/renderer/assets/seti/NOTICE.md.

/** \`[fontCharacter, darkThemeColor, lightThemeColor]\` for one Seti icon. */
export type SetiIconDefinition = readonly [character: string, dark: string, light: string]

export const DEFAULT_ICON_ID = ${q(theme.file)}

export const ICON_DEFINITIONS: Record<string, SetiIconDefinition> = {
${defEntries}
}

${stringMap('ICON_BY_FILE_NAME', 'Record<string, string>', theme.fileNames)}
${stringMap('ICON_BY_FILE_EXTENSION', 'Record<string, string>', theme.fileExtensions)}
${stringMap('ICON_BY_LANGUAGE_ID', 'Record<string, string>', theme.languageIds)}
${stringMap('LANGUAGE_BY_FILE_NAME', 'Record<string, string>', langs.byFileName)}
${stringMap('LANGUAGE_BY_EXTENSION', 'Record<string, string>', langs.byExtension)}
/** Longest pattern first, matching VS Code's longest-filepattern-wins rule. */
export const LANGUAGE_BY_FILE_NAME_PATTERN: readonly (readonly [pattern: string, languageId: string])[] = [
${langs.patterns.map(([p, id]) => `  [${q(p)}, ${q(id)}],`).join('\n')}
]
`
}

// ── CLI ────────────────────────────────────────────────────────────

const { vscode } = parseArgs(process.argv.slice(2))
const theme = readSetiTheme(vscode)

// VS Code aliases jsonc to json when the theme omits it (fileIconThemeData.ts).
if (!theme.languageIds.jsonc && theme.languageIds.json) theme.languageIds.jsonc = theme.languageIds.json

const langs = readLanguageAssociations(vscode, new Set(Object.keys(theme.languageIds)))
writeFileSync(OUT_FILE, generate({ theme, langs }))

console.log(
  `[seti] wrote ${OUT_FILE}\n` +
    `       ${Object.keys(buildDefinitions(theme)).length} icons, ` +
    `${Object.keys(theme.fileNames).length} file names, ` +
    `${Object.keys(theme.fileExtensions).length} extensions, ` +
    `${Object.keys(theme.languageIds).length} languages ` +
    `(${Object.keys(langs.byExtension).length} language extensions, ` +
    `${Object.keys(langs.byFileName).length} language file names, ` +
    `${langs.patterns.length} patterns)`,
)
