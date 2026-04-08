# Manifold AI IDE Talk Outline

## Research Notes

This outline is based on the current repository, especially:

- `README.md`
- `docs/external-provisioners.md`
- `docs/superpowers/designs/2026-03-28-simple-view-vercel-deploy-design.md`
- `src/main/agent/runtimes.ts`
- `src/main/background-agent-host/background-agent-research-prompt.ts`
- `src/main/deploy/vercel-health-check.ts`
- `src/renderer/components/background-agent/BackgroundAgentPanel.tsx`
- `src/renderer/components/terminal/ShellTabs.tsx`
- `src/shared/defaults.ts`
- `src/shared/provisioning-types.ts`
- `src/shared/simple-prompts.ts`
- `src/shared/themes/theme-data.ts`

### Verified Talking Points

- Manifold is an Electron desktop app built around running native CLI coding agents side by side on the same codebase.
- The current built-in runtimes are Claude Code, Codex, Copilot, Gemini CLI, and Ollama-backed Claude/Codex.
- The core product idea is real git worktrees plus real PTY terminals, not a wrapped chat abstraction.
- There are two product modes: Developer View and Simple View.
- Developer View includes dockable panes, diffs, file tree, shell tabs, previews, and PR workflows.
- Search supports code, memory, or everything, with local memory persisted in SQLite.
- There is a project-aware ideas feed that researches the web for source-backed suggestions.
- External and bundled provisioners are supported through a versioned CLI JSON protocol.
- Vercel support is present in the codebase through built-in provisioner settings and a Simple View deploy flow.
- Manifold has multiple custom themes and a strong UI/theming focus.
- The repo includes `CONTRIBUTING.md`, so inviting contributions is grounded.

### Accuracy Notes

- The product direction is OS-agnostic, but the current packaged app and build scripts are still macOS-only.
- `README.md` still says Simple View deployment is not implemented, but the codebase now includes a Vercel deploy flow. Mention this carefully depending on the build you demo.
- I could not find the term `VCE` in the repo. If you mention it, present it as your internal/custom provisioner story rather than a repo-defined feature name.

## Recommended Title

**Manifold: Real Git Worktrees, Real Terminals, Native AI Engines**

## Core Message

Manifold started as a better way to work with git worktrees, but the deeper idea is bigger: keep the power and authenticity of native AI coding engines while giving them a desktop workspace that feels coherent, fast, and beautiful.

## 60-Minute Run Of Show

Target: 52-55 minutes of presentation, 5-8 minutes for questions.

| Time | Section | Purpose |
| --- | --- | --- |
| 0:00-0:04 | Opening: why this exists | Frame the frustration that led to Manifold |
| 0:04-0:11 | Git worktrees in one slide | Give the audience the mental model |
| 0:11-0:17 | The product thesis | Explain why you built this instead of another editor wrapper |
| 0:17-0:24 | How I built Manifold with AI | Show the actual agentic workflow behind the product |
| 0:24-0:30 | Architecture and runtime model | Show why Electron and native CLIs were the right fit |
| 0:30-0:37 | Developer View walkthrough | Show the serious engineering workflow |
| 0:37-0:42 | Simple View walkthrough | Show the broader app-builder flow |
| 0:42-0:46 | Shell integration | Explain the Warp-inspired terminal experience |
| 0:46-0:50 | Search, memory, and context | Show how Manifold becomes more than a terminal launcher |
| 0:50-0:52 | Provisioners and extensibility | Show how projects get created and extended |
| 0:52-0:55 | Ideas feed, themes, and contribution | Land on product depth, taste, and community |
| 0:55-1:00 | Q&A | Leave time for discussion |

## Slide-By-Slide Outline

### 1. Opening: The Problem I Wanted To Solve

**Time:** 4 minutes

- I wanted isolated branches I could work on in parallel across one or many repositories.
- I wanted the freedom of native CLI agents, not a locked-in AI editor.
- I wanted a desktop app that feels polished like Cursor, but keeps the real engine underneath.

**Key line to use:**

> Manifold started as a worktree tool, but it became a way to give native AI coding agents a serious workspace.

### 2. Git Worktrees In One Slide

**Time:** 7 minutes

- Explain the normal pain: branch switching, dirty state, stashing, collisions between experiments.
- Explain the worktree model: one repository, multiple working directories, each on its own branch.
- Explain why this matters for AI agents: each agent gets isolation by default.
- Explain why this matters for humans: parallelism without chaos.

**Suggested slide structure:**

- Left side: traditional single working directory workflow
- Right side: one repo, multiple worktrees, multiple agents
- Bottom line: isolation is the primitive that makes parallel AI work sane

### 3. Product Thesis: Cursor Feel, Native Engines

**Time:** 6 minutes

- Most AI IDEs either wrap the model heavily or hide the underlying tool.
- Manifold keeps the native engine intact: Claude Code, Codex, Gemini CLI, Copilot.
- The terminal is not fake. It is the real PTY, with live output and manual intervention whenever needed.
- The app is an orchestrator and workspace layer, not a replacement for the agent.

**Key contrast to make:**

- Not “another model”
- Not “another editor fork”
- A workspace for serious AI-assisted engineering

### 4. How I Built Manifold With AI

**Time:** 4 minutes

- Manifold was not only designed for agentic coding. It was also built with agentic coding.
- My role is to bring intent, product taste, architecture judgment, and evaluation.
- AI helps me move from a rough idea to a spec, then to a plan, then to working code faster.
- The important point is not "ask AI to code." The important point is to create enough structure that the AI can do strong work.

**Good framing:**

- AI is part of the development process, not a magic replacement for technical judgment.
- The product and the workflow reinforce each other: Manifold was built using the same kind of loop it tries to support.

### 5. My Agentic Coding Loop

**Time:** 3 minutes

- Have at least a general idea of the intent.
- Ask AI to get familiar with the context material first.
- Tell the AI your intent and thoughts, then ask for its thoughts.
- Ask it to create a markdown specification.
- Ask it to create an implementation plan if it has not done so already.
- Ask it to implement the work.
- Test the new thing or feature.
- Ask AI to refactor the result based on rules like max LOC and other code-quality constraints.

**Operational defaults:**

- Use the best model available with the highest reasoning effort for serious architecture, specification, and planning work.
- When working in Claude Code, use the Superpowers plugin.
- Treat specification, planning, implementation, testing, and refactoring as separate phases instead of one vague prompt.

### 6. Why Electron, And How The App Is Structured

**Time:** 7 minutes

- Electron gives you a desktop app with a mature UI stack and strong native integration.
- VS Code proved Electron can power serious developer tooling.
- Manifold uses the standard Electron split:
- Main process owns PTYs, worktrees, git operations, memory, settings, and provisioning.
- Preload keeps the boundary safe.
- Renderer delivers the desktop UX.
- The long-term direction is OS-agnostic, even though the current packaged app is macOS-first.

**Good framing:**

- Electron was a pragmatic choice, not a compromise.
- The architecture fits the job because the job is orchestration of real local tools.

### 7. Developer View: The Core Engineering Workflow

**Time:** 8 minutes

- Launch an agent on a fresh `manifold/*` worktree branch.
- Or run on the current branch, an existing branch, or even an open PR branch.
- Watch the real terminal.
- Review diffs and files in parallel.
- Use shell tabs, previews, editors, and PR workflows without leaving the app.
- Keep layout, tabs, and session state across restarts.

**What to demo if you want a live segment:**

- Open a repo
- Spawn two agents in parallel
- Show the worktree branch naming and isolation
- Show diff review and shell tabs
- Show that you can still type directly into the terminal

### 8. Simple View: A Different Product Surface

**Time:** 6 minutes

- Simple View is for quickly building local apps from chat.
- It uses a constrained local stack: React 19, TypeScript, Vite, Dexie, CSS Modules.
- It is optimized for non-technical or less terminal-heavy workflows.
- The important point is that it is not a separate product. It is another surface over the same system.
- You can jump from Simple View to Developer View when you need more control.

**Narrative angle:**

- Same engine room, different cockpit.

### 9. Shell Integration Inspired By Warp

**Time:** 5 minutes

- Shell matters because serious users still need direct command execution.
- Manifold adds context around the shell rather than replacing it.
- Shell tabs persist.
- The shell panel shows project, branch, and path context.
- This makes the shell feel like part of the workspace instead of an external escape hatch.

**Key point:**

- The shell is not a fallback. It is a first-class part of the product.

### 10. Search With Memory

**Time:** 5 minutes

- Search spans code, memory, or both.
- Memory is local and project-based, stored in SQLite.
- Session interactions, observations, and summaries accumulate over time.
- That memory improves retrieval and resumed-session context.
- This is where Manifold starts to feel like more than a launcher for multiple terminals.

**Bridge line:**

- Worktrees solve isolation. Memory solves continuity.

### 11. Provisioners, Vercel, And Extensibility

**Time:** 4 minutes

- Manifold does not just open repos; it can provision them.
- Provisioners use a versioned CLI protocol over `stdin` and `stdout`.
- That means provisioners can be bundled or external.
- Vercel templates are already represented in the current settings defaults.
- If you want to mention VCE, position it as your own custom/internal provisioner story.
- In Simple View, there is also a Vercel deploy flow in the codebase.

**Important audience takeaway:**

- Manifold is opinionated, but extensible in the right place.

### 12. Project-Aware Ideas Generator

**Time:** 3 minutes

- Manifold includes a background ideas feed that profiles the current project and researches the web.
- The output is source-backed ideas, not vague brainstorming.
- This is an example of Manifold becoming a project-aware engineering partner, not just a front end for agent sessions.

**Good phrasing:**

- On-demand ideas, grounded in both local project context and external signals.

### 13. Floating Panes, Themes, And Why Taste Matters

**Time:** 3 minutes

- The workspace is dockable and pane-driven.
- Theming is a real part of the product, with multiple custom themes in the repo.
- Beautiful tools matter because people spend hours inside them.
- This is not cosmetic polish after the fact; it is part of the product thesis.

**Key line:**

- If you want people to live in the tool, utility is not enough. Taste matters.

### 14. Close: What Manifold Really Is

**Time:** 2-3 minutes

- It began with git worktrees.
- It became an orchestration layer for native AI coding engines.
- It now points toward a bigger idea: a desktop workspace for parallel, local-first, extensible AI engineering.
- End with contribution: the repo is open to contributors, and the product is still actively evolving.

**Closing sentence:**

> Manifold is my attempt to make AI coding feel native, parallel, and real.

## Suggested Q&A Topics

If questions are slow, seed them with one of these:

- Why not just use Cursor or VS Code plus extensions?
- Why keep the terminal so central instead of abstracting it away?
- Why Electron?
- How do worktrees change the way AI agents collaborate?
- How do you decide what belongs in Simple View versus Developer View?
- What would it take to make the app truly OS-agnostic?

## What To Emphasize Repeatedly

- Real git worktrees
- Real terminals
- Native AI engines
- Parallel workflows
- Local-first memory and context
- A polished desktop UX around serious engineering primitives

## Optional Trim If You Run Long

- Shorten the Electron architecture section by 2 minutes.
- Cut the ideas-generator section to 1 minute.
- Fold themes and contribution into the closing slide.
