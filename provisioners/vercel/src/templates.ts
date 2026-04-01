import type { ProvisionerTemplate } from '../../../src/shared/provisioning-types'

interface BundledTemplateDefinition extends ProvisionerTemplate {
  repo: string
}

const SHARED_FIELDS = {
  owner: {
    type: 'string' as const,
    title: 'GitHub owner (optional)',
    placeholder: 'defaults to your GitHub user',
    description: 'GitHub user or org. Leave empty for your personal account.',
  },
}

const COMMUNICATION_INSTRUCTIONS = `Communication style:
- Narrate what you're doing as you go so the user can follow along (e.g. "Updating the color scheme", "Adding a new gallery component").
- Keep each update to one short sentence — the user sees every message.
- Vary your phrasing. Don't start every message with "Now" — just describe what you're doing directly.
- When you're done, give a brief summary of what changed.

When the user's request is ambiguous or you need clarification, ask a follow-up question with suggested options. You MUST format options using EXACTLY this structure at the very end of your message:

---options---
1. First option
2. Second option
3. Third option
---end---

IMPORTANT: You MUST include both the ---options--- and ---end--- markers. Always place the options block at the very end of your message with nothing after ---end---. Include 2-4 options that cover the most likely choices. Keep each option concise (a few words to one sentence).
`

const TEMPLATES: BundledTemplateDefinition[] = [
  {
    id: 'vercel-starter',
    title: 'Vercel Starter',
    description: 'Next.js starter deployed to Vercel',
    category: 'Web',
    tags: ['vercel', 'nextjs', 'react'],
    repo: 'svenmalvik/manifold_vercel_template',
    paramsSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: 'Repository name',
          placeholder: 'e.g. my-vercel-app',
        },
        description: {
          type: 'string',
          title: 'Describe what you want to build',
          placeholder: 'e.g. A dashboard that tracks daily habits',
          multiline: true,
        },
        owner: SHARED_FIELDS.owner,
      },
      required: ['name', 'description'],
    },
    promptInstructions: `You are building a web application on top of an existing Next.js project that was provisioned from a Vercel starter template.

Tech stack (already set up in the repository — do NOT reinstall or re-scaffold):
- Next.js with React and TypeScript
- The project is ready for deployment on Vercel

Requirements:
- Work with the existing project structure — do not recreate it from scratch
- Run "npm install" then "npm run dev" to start the dev server so the user can preview immediately
- The app must look polished and modern with a clean UI
- Use functional components and React hooks

${COMMUNICATION_INSTRUCTIONS}`,
  },
  {
    id: 'tool-researcher',
    title: 'Tool Researcher',
    description: 'AI-guided workspace for evaluating a tool and publishing the final recommendation',
    category: 'Research',
    tags: ['research', 'markdown', 'mermaid', 'static-site'],
    repo: 'svenmalvik/tool_researcher',
    paramsSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: 'Repository name',
          placeholder: 'e.g. lovable-evaluation',
        },
        description: {
          type: 'string',
          title: 'What tool should be evaluated?',
          placeholder: 'e.g. Evaluate whether Lovable is worth adopting for internal prototyping',
          multiline: true,
        },
        owner: SHARED_FIELDS.owner,
      },
      required: ['name', 'description'],
    },
    promptInstructions: `You are working inside an existing Tool Researcher repository template. This repository is already scaffolded and is NOT a React or Next.js app.

Tech stack and structure already present in the repository:
- Static HTML, CSS, and JavaScript files
- Markdown-driven content rendered by the website
- A small Node.js HTTP server started with "npm run dev"
- Mermaid diagrams rendered from Markdown code fences

Requirements:
- Work with the existing repository structure — do not re-scaffold the project
- Run "npm install" then "npm run dev" so the user can preview the site immediately
- Use the repository as a research workspace for evaluating the requested tool
- Build or update the linked research package under "research/"
- Keep the website and Markdown content coherent so the output reads like a polished recommendation package
- Replace the starter content only as the research package becomes ready; do not leave placeholder copy behind

${COMMUNICATION_INSTRUCTIONS}`,
  },
]

export function getTemplates(): ProvisionerTemplate[] {
  return TEMPLATES.map(({ repo: _repo, ...template }) => template)
}

export const TEMPLATE_REPOS: Record<string, string> = TEMPLATES.reduce<Record<string, string>>((repos, template) => {
  repos[template.id] = template.repo
  return repos
}, {})
