// Devicon SVG imports — import raw SVG content for inline rendering
const iconModules = import.meta.glob<string>('../../assets/devicons/*.svg', { eager: true, query: '?raw', import: 'default' })

const deviconSvgs: Record<string, string> = {}
for (const [path, svg] of Object.entries(iconModules)) {
  const name = path.split('/').pop()?.replace('.svg', '') ?? ''
  deviconSvgs[name] = svg
}

const EXT_TO_ICON: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', pyw: 'python', pyi: 'python',
  java: 'java', jar: 'java',
  cs: 'csharp',
  cpp: 'cplusplus', cc: 'cplusplus', cxx: 'cplusplus', hpp: 'cplusplus', hxx: 'cplusplus',
  c: 'c', h: 'c',
  go: 'go',
  rs: 'rust',
  rb: 'ruby', erb: 'ruby', gemspec: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin', kts: 'kotlin',
  html: 'html5', htm: 'html5',
  css: 'css3',
  scss: 'sass', sass: 'sass',
  graphql: 'graphql', gql: 'graphql',
  lua: 'lua',
  dart: 'dart',
  ex: 'elixir', exs: 'elixir',
  hs: 'haskell', lhs: 'haskell',
  scala: 'scala', sc: 'scala',
  clj: 'clojure', cljs: 'clojure', cljc: 'clojure', edn: 'clojure',
  json: 'json',
  xml: 'xml', xsl: 'xml', xslt: 'xml',
  yaml: 'yaml', yml: 'yaml',
  md: 'markdown', mdx: 'markdown',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  sql: 'postgresql',
}

const FILENAME_TO_ICON: Record<string, string> = {
  'Dockerfile': 'docker',
  'docker-compose.yml': 'docker',
  'docker-compose.yaml': 'docker',
  '.gitignore': 'git',
  '.gitattributes': 'git',
  '.gitmodules': 'git',
  '.gitkeep': 'git',
  '.gitconfig': 'git',
  '.dockerignore': 'docker',
  '.editorconfig': 'eslint',
  '.prettierrc': 'eslint',
  '.prettierrc.json': 'eslint',
  '.prettierignore': 'eslint',
  'tsconfig.json': 'typescript',
  'tsconfig.node.json': 'typescript',
  'tsconfig.web.json': 'typescript',
  '.artifactignore': 'azure',
  'azure-pipelines.yml': 'azure',
  'azure-pipelines.yaml': 'azure',
  'package.json': 'nodejs',
  'package-lock.json': 'npm',
  '.npmrc': 'npm',
  'yarn.lock': 'yarn',
  '.yarnrc': 'yarn',
  'webpack.config.js': 'webpack',
  'webpack.config.ts': 'webpack',
  'vite.config.ts': 'vite',
  'vite.config.js': 'vite',
  'tailwind.config.js': 'tailwindcss',
  'tailwind.config.ts': 'tailwindcss',
  '.eslintrc': 'eslint',
  '.eslintrc.js': 'eslint',
  '.eslintrc.json': 'eslint',
  'eslint.config.js': 'eslint',
  'eslint.config.mjs': 'eslint',
  'jest.config.js': 'jest',
  'jest.config.ts': 'jest',
  'vitest.config.ts': 'vitest',
  'vitest.config.js': 'vitest',
  'firebase.json': 'firebase',
  '.firebaserc': 'firebase',
  'go.mod': 'go',
  'go.sum': 'go',
  'Makefile': 'bash',
  'makefile': 'bash',
  'Gemfile': 'ruby',
  'Rakefile': 'ruby',
}

// Icons that use dark fills and need currentColor to be visible in dark mode
const CURRENT_COLOR_ICONS = new Set(['apple', 'markdown', 'rust', 'github', 'bash'])

export function getFileIconSvg(filename: string): string | null {
  // Check exact filename match first
  let iconName = FILENAME_TO_ICON[filename]

  // Then check extension
  if (!iconName) {
    const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : null
    if (ext) iconName = EXT_TO_ICON[ext]
  }

  if (!iconName || !deviconSvgs[iconName]) return null

  let svg = deviconSvgs[iconName]
  if (CURRENT_COLOR_ICONS.has(iconName)) {
    svg = svg.replace(/fill="[^"]*"/g, 'fill="currentColor"')
    // For SVGs with no fill attributes on paths (defaults to black), set fill on the root <svg>
    svg = svg.replace('<svg ', '<svg fill="currentColor" ')
  }

  return svg
}
