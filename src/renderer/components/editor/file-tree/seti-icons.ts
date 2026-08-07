// Resolves a file name to an icon from VS Code's default file icon theme (Seti), reproducing
// VS Code's own precedence. VS Code expresses that precedence through CSS specificity — it emits
// one rule per theme entry and lets the browser pick the winner (`fileIconThemeData.ts`
// `toCSSRules`, `getIconClasses.ts`) — which works out to:
//
//   exact file name  >  longest matching extension  >  detected language  >  default
//
// The detected language is what makes the theme feel complete: Seti deliberately has no
// `fileExtensions` entry for the common types (ts, js, py, go, md, …) and maps them by language
// id instead. Language detection has its own order, also taken from VS Code
// (`languagesAssociations.ts` `getAssociationByPath`): exact file name, then the longest matching
// file-name pattern, then the longest matching extension.
//
// The tables are generated from a VS Code checkout by scripts/generate-seti-icons.mjs.
import {
  DEFAULT_ICON_ID,
  ICON_BY_FILE_EXTENSION,
  ICON_BY_FILE_NAME,
  ICON_BY_LANGUAGE_ID,
  ICON_DEFINITIONS,
  LANGUAGE_BY_EXTENSION,
  LANGUAGE_BY_FILE_NAME,
  LANGUAGE_BY_FILE_NAME_PATTERN,
} from './seti-icon-data'

export interface SetiFileIcon {
  /** The glyph to render in the `seti` icon font. */
  character: string
  /** Icon colour on dark themes. */
  color: string
  /** Icon colour on light themes, where Seti's dark palette reads too bright. */
  lightColor: string
}

/** Seti's file-name patterns only use `*`, and always match a base name (never a path). */
const PATTERN_REGEXPS: readonly (readonly [RegExp, string])[] = LANGUAGE_BY_FILE_NAME_PATTERN.map(
  ([pattern, languageId]) => {
    const source = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    return [new RegExp(`^${source}$`), languageId] as const
  },
)

/** Every suffix of `fileName` that starts at a dot, longest first — the candidate extensions. */
function extensionsOf(fileName: string): string[] {
  const extensions: string[] = []
  for (let i = fileName.indexOf('.'); i !== -1; i = fileName.indexOf('.', i + 1)) {
    extensions.push(fileName.slice(i + 1))
  }
  return extensions
}

function detectLanguageId(fileName: string): string | undefined {
  const byFileName = LANGUAGE_BY_FILE_NAME[fileName]
  if (byFileName) return byFileName

  for (const [pattern, languageId] of PATTERN_REGEXPS) {
    if (pattern.test(fileName)) return languageId
  }

  for (const extension of extensionsOf(fileName)) {
    const byExtension = LANGUAGE_BY_EXTENSION[`.${extension}`]
    if (byExtension) return byExtension
  }

  return undefined
}

function resolveIconId(fileName: string): string {
  const byFileName = ICON_BY_FILE_NAME[fileName]
  if (byFileName) return byFileName

  for (const extension of extensionsOf(fileName)) {
    const byExtension = ICON_BY_FILE_EXTENSION[extension]
    if (byExtension) return byExtension
  }

  const languageId = detectLanguageId(fileName)
  const byLanguage = languageId ? ICON_BY_LANGUAGE_ID[languageId] : undefined
  if (byLanguage) return byLanguage

  return DEFAULT_ICON_ID
}

const cache = new Map<string, SetiFileIcon>()

/** The Seti icon for a file's base name. Never fails — unknown names get the default glyph. */
export function getSetiFileIcon(fileName: string): SetiFileIcon {
  const key = fileName.toLowerCase()
  const cached = cache.get(key)
  if (cached) return cached

  const [character, color, lightColor] = ICON_DEFINITIONS[resolveIconId(key)]
  const icon = { character, color, lightColor }
  cache.set(key, icon)
  return icon
}
