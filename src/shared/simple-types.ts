export type ChatRole = 'user' | 'agent' | 'system'

export interface ChatMessage {
  id: string
  sessionId: string
  role: ChatRole
  text: string
  timestamp: number
}

export type AppStatus = 'idle' | 'scaffolding' | 'building' | 'previewing' | 'deploying' | 'live' | 'error'

export interface SimpleApp {
  sessionId: string
  projectId: string
  name: string
  description: string
  status: AppStatus
  previewUrl: string | null
  liveUrl: string | null
  createdAt: number
  updatedAt: number
}

export interface DeploymentStatus {
  sessionId: string
  stage: AppStatus
  message: string
  url?: string
}

/**
 * Wraps the user's app description into a full system prompt
 * that constrains the agent to the Manible tech stack.
 */
export function buildSimplePrompt(description: string): string {
  return `You are building a web application for a non-technical user. Follow these rules strictly:

Tech stack (do NOT deviate):
- React 19 with TypeScript
- Vite as the build tool
- IndexedDB via Dexie.js for local data persistence (no external databases or servers)
- CSS Modules for styling (no Tailwind, no styled-components)

Requirements:
- Create a fully working single-page React app
- All data must be stored locally in the browser using IndexedDB (Dexie.js)
- Include a dev server that runs on a free port (use Vite defaults)
- The app must look polished and modern with a clean UI
- Use functional components and React hooks
- Keep the project structure simple and flat

After scaffolding, run "npm install" then "npm run dev" so the user can preview immediately.

The user wants:
${description}`
}
