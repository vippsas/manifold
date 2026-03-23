interface PromptChatMessage {
  role: 'user' | 'agent' | 'system'
  text: string
  options?: string[]
}

const SIMPLE_MODE_RULES = `You are building a web application for a non-technical user. Follow these rules strictly:

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

Communication style:
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

const FOLLOW_UP_HISTORY_LIMIT = 20

function formatMessage(message: PromptChatMessage): string {
  const roleLabel =
    message.role === 'user' ? 'User'
    : message.role === 'agent' ? 'Assistant'
    : 'System'

  const optionsText = message.options && message.options.length > 0
    ? `\nOptions:\n${message.options.map((option, index) => `${index + 1}. ${option}`).join('\n')}`
    : ''

  return `${roleLabel}: ${message.text.trim()}${optionsText}`
}

/**
 * Wraps the user's app description into a full system prompt
 * that constrains the agent to the Manifold tech stack.
 */
export function buildSimplePrompt(description: string, templateTitle?: string): string {
  const templateContext = templateTitle
    ? `You are starting from the "${templateTitle}" template in the current repository.\n` +
      `Use the existing files as the starting point and extend them instead of rebuilding from scratch unless necessary.\n\n`
    : ''

  return `${templateContext}${SIMPLE_MODE_RULES}The user wants:
${description}`
}

export function buildSimpleFollowUpPrompt(messages: PromptChatMessage[], latestUserRequest: string): string {
  const trimmedRequest = latestUserRequest.trim()
  const recentMessages = messages
    .filter((message) => message.text.trim().length > 0)
    .slice(-FOLLOW_UP_HISTORY_LIMIT)

  const history =
    recentMessages.length > 0 &&
    recentMessages[recentMessages.length - 1]?.role === 'user' &&
    recentMessages[recentMessages.length - 1]?.text.trim() === trimmedRequest
      ? recentMessages.slice(0, -1)
      : recentMessages

  const transcript = history.length > 0
    ? history.map(formatMessage).join('\n\n')
    : 'No prior chat history.'

  return `You are continuing work on an existing simple-mode web app in the current repository.

Use the current files in the repository as the source of truth. Continue from the existing implementation instead of rebuilding the app from scratch unless the user explicitly asks for that.

Follow these rules strictly:

${SIMPLE_MODE_RULES}Conversation so far:
${transcript}

Latest user request:
${trimmedRequest}`
}
