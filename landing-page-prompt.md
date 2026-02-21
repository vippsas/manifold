# Manifold Landing Page — Design Prompt

## Brand Identity

**Manifold** is a desktop app for developers who run multiple AI coding agents in parallel on the same project — without conflicts, without wrappers, without compromise.

## Color System

Two colors only. No gradients. No soft transitions. Hard edges, flat fills, maximum contrast.

| Role | Color | Hex |
|------|-------|-----|
| **Primary (background, text)** | Void Black | `#0A0A0A` |
| **Accent (highlights, CTAs, borders)** | Electric Chartreuse | `#CCFF00` |

White (`#FAFAFA`) for body text on dark backgrounds. The chartreuse is used sparingly — headlines, buttons, terminal cursor blinks, wire-frame illustrations, and hover states. Everything else is black or near-black. The page should feel like a high-end terminal that glows.

## Typography

Monospace for headlines and code snippets (JetBrains Mono, Fira Code, or similar). Clean sans-serif for body text (Inter, Space Grotesk). Headlines should be large and commanding — 64px+ on desktop.

## Hero Section

**Headline:**
> One app. Many repos. Even more agents.

**Subheadline:**
> Manifold orchestrates multiple AI agents across isolated branches so they never step on each other's code. No wrappers. No plugins. The real CLI, untouched.

**CTA Button:** `Download for macOS` (chartreuse on black, sharp corners)

**Hero Visual:** A stylized split-screen showing three terminal panes — one running Claude Code, one running Codex, one running Gemini CLI — each with a different branch name in the prompt. The terminals are real, native, raw. Not mockups of a chat UI. Terminal text in monospace, cursor blinking chartreuse.

## Section 1 — "The Real Thing"

**Headline:**
> Your tools. Unmodified.

**Body:**
Manifold doesn't wrap, proxy, or re-skin your agents. When you open Claude Code inside Manifold, it *is* Claude Code — the same binary, the same keybindings, the same output. Same for Codex. Same for Gemini CLI. Manifold gives each agent its own terminal, its own workspace, its own branch. You keep the experience you already know.

**Visual:** Side-by-side comparison. Left: "Claude Code in your terminal." Right: "Claude Code in Manifold." They look identical. A small label underneath: *"Spot the difference. There isn't one."*

## Section 2 — "Parallel Without the Pain"

**Headline:**
> Three agents. One repo. Zero conflicts.

**Body:**
Every agent works on its own isolated branch — a full copy of your codebase that stays in sync with main but never collides with another agent's work. Manifold creates, manages, and cleans up these branches automatically. You focus on what to build. Manifold handles where they build it.

**Key points (icon + one-liner each):**
- **Isolated branches** — Each agent gets a dedicated workspace branched from your main codebase. No merge conflicts between agents.
- **Automatic lifecycle** — Branches are created when you spawn an agent, removed when you're done. No manual git choreography.
- **Live status** — See which agent is running, waiting, or finished. Watch file changes stream in real time.
- **Conflict detection** — If two agents touch the same file, Manifold flags it immediately — before it becomes a merge nightmare.

**Visual:** A minimal diagram. One horizontal line labeled "main". Three branches forking off it at different points, each labeled with an agent icon (Claude, Codex, Gemini). The branches are chartreuse lines on black. Clean, geometric, no decorative fluff.

## Section 3 — "Multi-Repo, Multi-Agent"

**Headline:**
> One app. Every project. All your agents.

**Body:**
Register all your repositories in Manifold. Switch between them instantly. Spin up agents on any project with one click. Run a Claude Code agent refactoring your backend while a Gemini agent writes tests for your frontend — in two different repos, at the same time, from the same window.

**Visual:** A project switcher UI mockup showing 3-4 project names, each with a count of active agents. Minimal, flat, black-and-chartreuse.

## Section 4 — "Built for the Terminal"

**Headline:**
> Developers don't need dashboards. They need terminals.

**Body:**
Manifold's UI is a multi-pane terminal environment. Each agent gets a real PTY. You see raw output — streamed, unfiltered. Open a shell tab alongside your agents. Browse files and diffs without leaving the app. Everything is keyboard-navigable. No electron bloat. No loading spinners. Just your agents, working.

**Feature list:**
- Resizable multi-pane layout (agent terminal + code viewer + file tree + shell)
- Built-in diff viewer — compare agent branches against main
- File browser with syntax highlighting
- Shell tabs that persist across restarts
- AI-generated branch names and commit messages

**Visual:** An actual screenshot or high-fidelity mockup of Manifold's UI. Four panes visible. Dark theme. Chartreuse accents on the active pane border and status indicators.

## Section 5 — "How It Works"

Three steps. Horizontal layout. Numbered in large chartreuse type.

**1. Register a project**
Point Manifold at any git repository on your machine.

**2. Spawn agents**
Pick an agent (Claude Code, Codex, or Gemini CLI), describe the task, and launch. Manifold creates an isolated branch and drops the agent in.

**3. Ship the work**
Review diffs, commit changes, and create pull requests — all from inside Manifold.

## Section 6 — Social Proof / Open Source

**Headline:**
> Open source. Free. Built by developers, for developers.

**Body:**
Manifold is MIT-licensed and available on GitHub. Star it if you find it useful. Open an issue if you don't.

**CTA:** `View on GitHub` (outlined button, chartreuse border on black)

## Footer

Minimal. GitHub link. License badge. Version number. No newsletter signup. No cookie banner. No fluff.

---

## Design Principles for the Entire Page

1. **No gradients.** Flat black, flat chartreuse, flat white. Hard color boundaries only.
2. **No rounded corners on primary elements.** Buttons, cards, and containers use sharp 0px or 2px radius maximum. This is a tool, not a toy.
3. **No stock photos.** Every visual is either a real screenshot, a terminal mockup, or a geometric diagram.
4. **No decorative animations.** If something moves, it communicates state (cursor blink, status pulse). Otherwise, it's static.
5. **Dense, not sparse.** The page should feel information-rich. Developers scan — give them content, not whitespace theater.
6. **Terminal aesthetic.** The page itself should feel like it could be running inside a terminal. Monospace headers. Minimal chrome. The design language of `stdout`, not Dribbble.

## Responsive Behavior

- Desktop: Multi-column layouts, large hero text, side-by-side comparisons
- Tablet: Stack columns, maintain type scale
- Mobile: Single column, reduce hero text to 36px, collapse visual comparisons to sequential blocks

## Tone of Voice

Direct. Technical. Confident without being arrogant. Speaks to developers who already use CLI agents and are frustrated by the overhead of running them in parallel manually. No marketing fluff. No "revolutionize your workflow." Just: here's what it does, here's how it works, here's the download.
