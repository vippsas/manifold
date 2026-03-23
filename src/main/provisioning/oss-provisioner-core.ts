import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type {
  ProvisionerTemplate,
  ProvisioningReadyResult,
} from '../../shared/provisioning-types'

const execFileAsync = promisify(execFile)
const CACHE_ROOT = path.join(os.tmpdir(), 'manifold-oss-provisioner-cache')
const TEMPLATE_ROOT = path.join(CACHE_ROOT, 'templates')
const GENERATED_ROOT = path.join(CACHE_ROOT, 'generated')
const GENERATED_RETENTION_MS = 24 * 60 * 60 * 1000

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    || 'new-project'
}

function titleCase(text: string): string {
  return text
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function templateFiles(displayName: string, description: string): Record<string, string> {
  const packageName = slugify(displayName)
  const title = titleCase(displayName)
  const appDescription = description.trim() || 'A local-first web app starter built by Manifold.'

  return {
    'README.md': [
      `# ${title}`,
      '',
      appDescription,
      '',
      '## Stack',
      '',
      '- React 19',
      '- TypeScript',
      '- Vite',
      '- Dexie / IndexedDB',
      '- CSS Modules',
      '',
      '## Scripts',
      '',
      '- `npm install`',
      '- `npm run dev`',
      '- `npm run build`',
      '',
    ].join('\n'),
    'AGENTS.md': [
      '# Agent Notes',
      '',
      'This repository is a Manifold simple-view starter.',
      '',
      'Keep these constraints:',
      '- React 19 with TypeScript',
      '- Vite build setup',
      '- Dexie for browser persistence',
      '- CSS Modules for styling',
      '',
      'When extending this starter:',
      '- preserve the existing structure unless there is a clear reason to change it',
      '- run `npm install` before starting the dev server',
      '- prefer building on the current files instead of recreating the project from scratch',
      '',
    ].join('\n'),
    '.gitignore': [
      'node_modules',
      'dist',
      '.vite',
      'coverage',
      '.DS_Store',
      '',
    ].join('\n'),
    'package.json': JSON.stringify({
      name: packageName,
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'tsc -b && vite build',
        preview: 'vite preview',
      },
      dependencies: {
        dexie: '^4.0.8',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
      },
      devDependencies: {
        '@types/react': '^19.0.0',
        '@types/react-dom': '^19.0.0',
        '@vitejs/plugin-react': '^4.3.4',
        typescript: '^5.7.0',
        vite: '^6.0.0',
      },
    }, null, 2) + '\n',
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        useDefineForClassFields: true,
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        allowJs: false,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        module: 'ESNext',
        moduleResolution: 'Node',
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: 'react-jsx',
      },
      include: ['src'],
    }, null, 2) + '\n',
    'vite.config.ts': [
      "import { defineConfig } from 'vite'",
      "import react from '@vitejs/plugin-react'",
      '',
      'export default defineConfig({',
      '  plugins: [react()],',
      '})',
      '',
    ].join('\n'),
    'index.html': [
      '<!doctype html>',
      '<html lang="en">',
      '  <head>',
      '    <meta charset="UTF-8" />',
      '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      `    <title>${title}</title>`,
      '  </head>',
      '  <body>',
      '    <div id="root"></div>',
      '    <script type="module" src="/src/main.tsx"></script>',
      '  </body>',
      '</html>',
      '',
    ].join('\n'),
    'src/main.tsx': [
      "import React from 'react'",
      "import ReactDOM from 'react-dom/client'",
      "import App from './App'",
      '',
      "ReactDOM.createRoot(document.getElementById('root')!).render(",
      '  <React.StrictMode>',
      '    <App />',
      '  </React.StrictMode>,',
      ')',
      '',
    ].join('\n'),
    'src/db.ts': [
      "import Dexie, { type EntityTable } from 'dexie'",
      '',
      'export interface SavedNote {',
      '  id: number',
      '  title: string',
      '  details: string',
      '  createdAt: string',
      '}',
      '',
      'const db = new Dexie(\'manifold-starter\') as Dexie & {',
      '  notes: EntityTable<SavedNote, \'id\'>',
      '}',
      '',
      'db.version(1).stores({',
      "  notes: '++id, createdAt, title',",
      '})',
      '',
      'export default db',
      '',
    ].join('\n'),
    'src/App.module.css': [
      '.page {',
      '  min-height: 100vh;',
      '  padding: 40px 20px 64px;',
      '  background: linear-gradient(180deg, #f7f8fc 0%, #eef2ff 100%);',
      '  color: #182033;',
      '}',
      '',
      '.shell {',
      '  width: min(960px, 100%);',
      '  margin: 0 auto;',
      '  display: grid;',
      '  gap: 24px;',
      '}',
      '',
      '.hero {',
      '  background: rgba(255, 255, 255, 0.88);',
      '  border: 1px solid rgba(58, 73, 128, 0.14);',
      '  border-radius: 24px;',
      '  padding: 28px;',
      '  box-shadow: 0 18px 50px rgba(24, 32, 51, 0.08);',
      '}',
      '',
      '.eyebrow {',
      '  display: inline-flex;',
      '  padding: 6px 10px;',
      '  border-radius: 999px;',
      '  background: #e8edff;',
      '  color: #3246a8;',
      '  font-size: 12px;',
      '  font-weight: 700;',
      '  letter-spacing: 0.04em;',
      '  text-transform: uppercase;',
      '}',
      '',
      '.title {',
      '  margin: 16px 0 10px;',
      '  font-size: clamp(32px, 6vw, 52px);',
      '  line-height: 1;',
      '}',
      '',
      '.description {',
      '  margin: 0;',
      '  max-width: 56ch;',
      '  color: #4d5b86;',
      '  line-height: 1.6;',
      '}',
      '',
      '.grid {',
      '  display: grid;',
      '  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));',
      '  gap: 24px;',
      '}',
      '',
      '.card {',
      '  background: rgba(255, 255, 255, 0.92);',
      '  border: 1px solid rgba(58, 73, 128, 0.14);',
      '  border-radius: 20px;',
      '  padding: 22px;',
      '  box-shadow: 0 12px 30px rgba(24, 32, 51, 0.06);',
      '}',
      '',
      '.cardTitle {',
      '  margin: 0 0 12px;',
      '  font-size: 18px;',
      '}',
      '',
      '.list {',
      '  display: grid;',
      '  gap: 12px;',
      '  margin: 0;',
      '  padding: 0;',
      '  list-style: none;',
      '}',
      '',
      '.listItem {',
      '  padding: 12px 14px;',
      '  border-radius: 14px;',
      '  background: #f5f7ff;',
      '  border: 1px solid rgba(58, 73, 128, 0.1);',
      '}',
      '',
      '.meta {',
      '  display: block;',
      '  margin-top: 6px;',
      '  color: #6b7696;',
      '  font-size: 13px;',
      '}',
      '',
      '.noteField, .textarea {',
      '  width: 100%;',
      '  border: 1px solid rgba(58, 73, 128, 0.16);',
      '  border-radius: 14px;',
      '  padding: 12px 14px;',
      '  font: inherit;',
      '  background: #fff;',
      '  color: inherit;',
      '  box-sizing: border-box;',
      '}',
      '',
      '.textarea {',
      '  min-height: 120px;',
      '  resize: vertical;',
      '}',
      '',
      '.actions {',
      '  display: flex;',
      '  justify-content: flex-end;',
      '  margin-top: 16px;',
      '}',
      '',
      '.button {',
      '  border: none;',
      '  border-radius: 999px;',
      '  background: linear-gradient(135deg, #3246a8 0%, #4f67e8 100%);',
      '  color: #fff;',
      '  padding: 12px 18px;',
      '  font-weight: 700;',
      '  cursor: pointer;',
      '}',
      '',
      '@media (max-width: 640px) {',
      '  .page {',
      '    padding: 20px 14px 40px;',
      '  }',
      '',
      '  .hero, .card {',
      '    padding: 18px;',
      '  }',
      '}',
      '',
    ].join('\n'),
    'src/App.tsx': [
      "import { useEffect, useState } from 'react'",
      "import db, { type SavedNote } from './db'",
      "import styles from './App.module.css'",
      '',
      `const STARTER_TITLE = ${JSON.stringify(title)}`,
      `const STARTER_DESCRIPTION = ${JSON.stringify(appDescription)}`,
      '',
      'export default function App(): JSX.Element {',
      '  const [notes, setNotes] = useState<SavedNote[]>([])',
      '  const [title, setTitle] = useState(\'\')',
      '  const [details, setDetails] = useState(\'\')',
      '',
      '  useEffect(() => {',
      '    void db.notes.orderBy(\'createdAt\').reverse().toArray().then(setNotes)',
      '  }, [])',
      '',
      '  const saveNote = async (): Promise<void> => {',
      '    if (!title.trim()) return',
      '    const createdAt = new Date().toISOString()',
      '    await db.notes.add({',
      '      title: title.trim(),',
      '      details: details.trim(),',
      '      createdAt,',
      '    })',
      '    setTitle(\'\')',
      '    setDetails(\'\')',
      '    setNotes(await db.notes.orderBy(\'createdAt\').reverse().toArray())',
      '  }',
      '',
      '  return (',
      '    <main className={styles.page}>',
      '      <div className={styles.shell}>',
      '        <section className={styles.hero}>',
      '          <span className={styles.eyebrow}>Manifold Starter</span>',
      '          <h1 className={styles.title}>{STARTER_TITLE}</h1>',
      '          <p className={styles.description}>{STARTER_DESCRIPTION}</p>',
      '        </section>',
      '',
      '        <div className={styles.grid}>',
      '          <section className={styles.card}>',
      '            <h2 className={styles.cardTitle}>Prototype panel</h2>',
      '            <input',
      '              className={styles.noteField}',
      '              value={title}',
      '              onChange={(event) => setTitle(event.target.value)}',
      '              placeholder="Capture the next feature or screen"',
      '            />',
      '            <div style={{ height: 12 }} />',
      '            <textarea',
      '              className={styles.textarea}',
      '              value={details}',
      '              onChange={(event) => setDetails(event.target.value)}',
      '              placeholder="Describe the interaction, layout, or data you want to add."',
      '            />',
      '            <div className={styles.actions}>',
      '              <button className={styles.button} onClick={() => void saveNote()}>',
      '                Save locally',
      '              </button>',
      '            </div>',
      '          </section>',
      '',
      '          <section className={styles.card}>',
      '            <h2 className={styles.cardTitle}>Local-first notes</h2>',
      '            <ul className={styles.list}>',
      '              {notes.length === 0 ? (',
      '                <li className={styles.listItem}>',
      '                  Nothing stored yet. Save one note to verify IndexedDB is wired correctly.',
      '                </li>',
      '              ) : (',
      '                notes.map((note) => (',
      '                  <li key={note.id} className={styles.listItem}>',
      '                    <strong>{note.title}</strong>',
      '                    {note.details ? <span className={styles.meta}>{note.details}</span> : null}',
      '                    <span className={styles.meta}>{new Date(note.createdAt).toLocaleString()}</span>',
      '                  </li>',
      '                ))',
      '              )}',
      '            </ul>',
      '          </section>',
      '        </div>',
      '      </div>',
      '    </main>',
      '  )',
      '}',
      '',
    ].join('\n'),
  }
}

export function getBundledTemplates(): ProvisionerTemplate[] {
  return [
    {
      id: 'web-react-vite',
      title: 'Web App',
      description: 'React, TypeScript, Vite, Dexie, and CSS Modules starter for Simple view.',
      category: 'Web',
      tags: ['react', 'vite', 'typescript', 'dexie', 'css-modules'],
      paramsSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            title: 'App name',
            placeholder: 'e.g. customer-feedback',
          },
          description: {
            type: 'string',
            title: 'Describe what you want to build',
            placeholder: 'e.g. A feedback page where customers submit their name and a message.',
            multiline: true,
          },
        },
        required: ['name', 'description'],
      },
    },
  ]
}

async function gitCommitAll(cwd: string, message: string): Promise<void> {
  await execFileAsync('git', ['add', '.'], { cwd })
  await execFileAsync(
    'git',
    ['-c', 'user.email=manifold@local', '-c', 'user.name=Manifold', 'commit', '-m', message],
    { cwd },
  )
}

function writeFiles(baseDir: string, files: Record<string, string>): void {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(baseDir, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, 'utf-8')
  }
}

function pruneGeneratedRepos(): void {
  if (!fs.existsSync(GENERATED_ROOT)) return
  for (const entry of fs.readdirSync(GENERATED_ROOT)) {
    const absolutePath = path.join(GENERATED_ROOT, entry)
    try {
      const stat = fs.statSync(absolutePath)
      if (Date.now() - stat.mtimeMs > GENERATED_RETENTION_MS) {
        fs.rmSync(absolutePath, { recursive: true, force: true })
      }
    } catch {
      // Ignore prune failures.
    }
  }
}

export async function ensureSharedTemplateRepo(templateId: string): Promise<string> {
  const template = getBundledTemplates().find((entry) => entry.id === templateId)
  if (!template) {
    throw new Error(`Unknown bundled template: ${templateId}`)
  }

  const templateDir = path.join(TEMPLATE_ROOT, templateId)
  const gitDir = path.join(templateDir, '.git')
  if (fs.existsSync(gitDir)) {
    return templateDir
  }

  fs.rmSync(templateDir, { recursive: true, force: true })
  fs.mkdirSync(templateDir, { recursive: true })
  writeFiles(templateDir, templateFiles(template.title, template.description))

  await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: templateDir })
  await gitCommitAll(templateDir, `Template: ${template.title}`)
  return templateDir
}

export async function createBundledTemplateSource(
  templateId: string,
  inputs: Record<string, string | boolean>,
): Promise<ProvisioningReadyResult> {
  pruneGeneratedRepos()

  const sharedTemplateRepo = await ensureSharedTemplateRepo(templateId)
  fs.mkdirSync(GENERATED_ROOT, { recursive: true })

  const requestedName = String(inputs.name ?? templateId).trim()
  const requestedDescription = String(inputs.description ?? '').trim()
  const displayName = slugify(requestedName || templateId)
  const sourceDir = fs.mkdtempSync(path.join(GENERATED_ROOT, `${displayName}-`))

  await execFileAsync('git', ['clone', '--', sharedTemplateRepo, sourceDir])
  await execFileAsync('git', ['remote', 'remove', 'origin'], { cwd: sourceDir }).catch(() => {})

  writeFiles(sourceDir, templateFiles(requestedName || displayName, requestedDescription))
  await gitCommitAll(sourceDir, 'Customize starter app')

  return {
    displayName,
    repoUrl: sourceDir,
    defaultBranch: 'main',
    metadata: {
      templateId,
      requestedName,
    },
  }
}
