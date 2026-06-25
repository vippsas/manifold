<!-- wiki-covers: src/main/agent/runtimes.ts, package.json, src/shared/defaults.ts -->

# Manifold

Manifold is a macOS desktop app for running AI coding assistants (Claude Code, Codex, Gemini CLI, and others) side by side on the same codebase.

Each agent gets its own git worktree (a separate checkout of the repository on a dedicated branch) when you want isolation, so multiple agents can work on the same repo without branch conflicts. Agents run in real terminals, not wrapper UIs, so you can read and steer their output directly.

Around the terminals, Manifold adds the workspace tools you'd expect: code browsing, diffs, shell tabs, search, previews, commits, and pull requests.

Supported runtimes: **Claude Code**, **Codex**, **Copilot**, **Gemini CLI**, and **Ollama-backed Claude/Codex**.

![Manifold](manifold.jpg)

## Highlights

- Run multiple agents in parallel on one repository without branch collisions
- Use the full agent terminal directly, with live streaming output and manual input at any time
- Group several repositories into a **Workspace** and run one agent across all of them, each repo mounted through the runtime's own multi-directory flag
- Launch work on a new branch, the current branch, an existing branch, or an open pull request
- Spin up a brand-new local web app from a one-line description, scaffolded on a constrained React/Vite stack with a live preview
- Run automated **Loop** cycles that prompt an agent, evaluate the result, and commit on improvement or revert on regression
- Review changes with diffs, a file tree, split editors, shell tabs, and embedded localhost previews
- Search code, file names, captured session memory, or everything at once, with an optional AI mode that answers questions or surfaces the most relevant results
- Keep project state, chat history, dock layout, open files, and shell tabs across restarts

## Install

Download the latest `.dmg` from the [GitHub Releases page](https://github.com/vippsas/manifold/releases), open it, and drag Manifold to `Applications`.

### Requirements

| Requirement | Notes |
| --- | --- |
| macOS | The packaged app and build scripts currently target macOS only. |
| Git | Required for repository management, worktrees, diffs, commits, and pull request flows. |
| One supported CLI agent on your `PATH` | Manifold checks for the runtime binaries directly. |
| GitHub CLI (`gh`) | Optional, but required for creating pull requests from inside the app. |
| Ollama + at least one pulled model | Optional, only needed for the Ollama-backed runtimes. |

### Runtime Binaries

| Runtime | Binary Manifold looks for | Install | Notes |
| --- | --- | --- | --- |
| Claude Code | `claude` | [claude.com/claude-code](https://www.claude.com/product/claude-code) | Available in the built-in runtime list. |
| Codex | `codex` | [github.com/openai/codex](https://github.com/openai/codex) | Available in the built-in runtime list. |
| Copilot | `copilot` | [github.com/github/copilot-cli](https://github.com/github/copilot-cli) | Available in the built-in runtime list. |
| Gemini CLI | `gemini` | [github.com/google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) | Available in the built-in runtime list. |
| Claude Code (Ollama) | `ollama` | [ollama.com](https://ollama.com) | Launches through `ollama launch claude`; model selection is required. |
| Codex (Ollama) | `ollama` | [ollama.com](https://ollama.com) | Launches through `ollama launch codex`; model selection is required. |

On startup, Manifold reads the `PATH` from your shell profile and appends common binary directories like `~/.local/bin`, `/opt/homebrew/bin`, and `/usr/local/bin` so CLIs installed via Homebrew or similar tools are found even when Manifold is launched from Finder.

### Verify Your Setup

Before launching Manifold, confirm the prerequisites are reachable from your shell:

```bash
git --version            # any recent Git
gh --version             # optional, needed for pull request creation
claude --version         # or: codex --version / gemini --version / copilot --version
```

If a runtime command is not found, install it (see the links above) and make sure its binary is on your `PATH`.

## WSL / Linux (Windows 11)

Manifold runs on WSL2 with Ubuntu (or any distro). Windows-native is not supported.

### Prerequisites

```bash
# Required
sudo apt update && sudo apt install -y ripgrep git

# Recommended (for full prompt features — bash works too)
sudo apt install -y zsh

# Node.js 20+ via nvm: https://github.com/nvm-sh/nvm
```

### Install

```bash
git clone https://github.com/linuxdevel/manifold && cd manifold
npm install
./install-linux.sh   # builds AppImage and installs to ~/.local/bin/manifold
```

Ensure `~/.local/bin` is in your PATH:
```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
```

### Run in development

```bash
npm run dev
```

Requires WSLg (ships with Windows 11 22H2+). On older Windows, install an X server (e.g. [VcXsrv](https://sourceforge.net/projects/vcxsrv/)) and set `DISPLAY=:0`.

## The Workspace

Manifold opens straight into its full developer workspace — a panelled layout you can rearrange to suit your workflow. The current panel set includes:

- Repositories sidebar
- Agent terminal
- Search
- File tree
- Modified files
- Shell tabs
- Web preview
- One or more editor panes

Key workflows:

- Open an existing local repository or clone one from GitHub
- Start an agent on a fresh worktree branch (branches are named `<repo>/<task-slug>` automatically, for example `manifold/fix-login-bug`)
- Start an agent directly on the current branch when you do not want a worktree
- Continue work from an existing branch or from an open pull request
- Resume a stopped agent in place
- Generate commit messages and pull request descriptions using the same agent runtime the session used
- Detect merge conflicts and see how many commits your branch is ahead of or behind the base branch

## Working Across Multiple Repositories

A **Workspace** groups several repositories into one working set so a single agent can operate across all of them at once.

- Create one from the **New Workspace** action in the sidebar and pick the repositories — and the runtime — it should include
- The first repository is the agent's working directory; the others are mounted through the runtime's own multi-directory flag (`--add-dir` for Claude, Codex, and Copilot; `--include-directories` for Gemini)
- When the agent starts, Manifold creates a worktree for every git repository in the set, all on the same branch (`manifold/<workspace-name>` by default), and removes them again when the session ends
- Add or remove repositories from a workspace at any time from its sidebar section

Workspaces are useful when a task spans several repositories at once — for example, landing a change that touches both a backend and a frontend repo, or running the same refactor across many services. A workspace agent sees every included repository from the start; there is no orchestration layer or per-tool approval step in between.

## Building a Local App From a Prompt

When no project is selected, the sidebar offers **Start from scratch** (and **Start from copied instructions**) to create a brand-new local web app from a one-line description:

- Manifold creates a project folder under your storage directory (`~/.manifold/projects/...`) and tracks it automatically
- An agent scaffolds and iterates on the app, constrained to a local stack: **React 19**, **TypeScript**, **Vite**, **Dexie/IndexedDB** (browser-local database), and **CSS Modules**
- It runs `npm install` and `npm run dev` so the live preview comes up immediately
- You keep iterating through a chat panel while previewing the app, with the full terminal, diff, and git tools always one click away

This flow is intended for local prototyping and iteration. Deployment is not implemented.

## Typical Workflow

### Work On An Existing Repository

1. Open a local repo using the **Add Project** button, or clone one from the welcome screen.
2. Pick a project in the sidebar.
3. Launch an agent with a task description, for example:

   > Add input validation to the login form and write unit tests for the new checks.

4. Watch output in the terminal, steer it manually when needed, and review changes in the editor and diff views.
5. Commit from the status bar and open a pull request through `gh` when the branch is ready.

### Launching Agents

A new agent can start in four ways:

- **New branch**: the default path, using a dedicated git worktree
- **Current branch**: runs directly in the project checkout, without creating a separate worktree
- **Existing branch**: continue work already in progress
- **Open pull request**: select an open pull request, check out its branch, and continue work from there

Agent states shown in the UI: `running` (actively working), `waiting` (paused for input), `done` (finished successfully), and `error` (stopped on failure).

## Automated Loop

The **Loop** dock panel runs an automated improve-and-evaluate cycle on an agent session:

1. Prompt the agent with your instruction
2. Run a user-defined evaluation command
3. Extract a numeric score from the result — a process exit code, a regex match on stdout, a field from JSON output, or an LLM judge
4. Commit the changes if the score improved, or discard them and revert to the previous state if it regressed
5. Repeat until you stop it or the maximum number of iterations is reached

Each iteration has a configurable time limit; if the agent exceeds it, Manifold stops it automatically. Results are logged per worktree under `~/.manifold/loop-logs/`. The panel tracks the best score so far and offers **Restore Best** to jump back to the commit that produced it.

## Search And Memory

The workspace includes a search system that goes beyond file text search.

- Search modes: `code` (file contents), `files` (file names), `memory` (captured session data), or `everything` (code and memory together)
- Search scopes: the current session, all sessions for the current project, or across all registered projects — depending on mode
- Match modes: literal or regex
- Saved searches and recent searches are persisted per project
- `Ask AI` can answer questions using the retrieved results as context, or re-sort exact matches by relevance, depending on settings

Manifold also captures session data locally and stores it per project in SQLite:

- **interactions** — prompts sent and responses received
- **observations** — facts the agent noted during a session
- **session summaries** — compressed overviews used when resuming long sessions

That memory is used for search and to give the agent relevant history when a session is resumed.

## Local Data

By default, Manifold stores its state under `~/.manifold/`.

| Path | Purpose |
| --- | --- |
| `~/.manifold/config.json` | User settings (storage path, default runtime, theme, etc.) |
| `~/.manifold/projects.json` | Registered projects (name, path, base branch) |
| `~/.manifold/memory/*.db` | Per-project SQLite memory stores |
| `~/.manifold/loop-logs/*.jsonl` | Automated Loop iteration logs (one file per worktree) |
| `~/.manifold/debug.log` | Debug log — check here first when something goes wrong |
| `~/.manifold/worktrees/...` | Managed git worktrees (default location) |
| `~/.manifold/projects/...` | Locally generated app projects (default location) |

The storage root (`~/.manifold` by default) is configurable in Settings → Storage Path.

## Local Development

### Prerequisites

- Node.js 18+
- npm
- macOS
- Git
- At least one supported CLI runtime installed locally

### Get The Source

```bash
git clone https://github.com/vippsas/manifold.git
cd manifold
```

### Commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies. Run once after cloning, and again when `package.json` changes. |
| `npm run dev` | Launch Electron in development mode with hot reload via electron-vite. Auto-rebuilds native modules. |
| `npm start` | Run the built app locally. Also auto-rebuilds native Electron modules. |
| `npm run build` | Produce a production build of main, preload, and renderer bundles. |
| `npm run dist` | Build and package a macOS `.dmg` for distribution. |
| `npm run typecheck:node` | Typecheck main process, preload, and shared code (`tsconfig.node.json`). |
| `npm run typecheck:web` | Typecheck renderer and shared code (`tsconfig.web.json`). |
| `npm test` | Run the full vitest suite once. |
| `npm run test:watch` | Run vitest in watch mode while iterating on tests. |

Before opening a pull request, make sure `npm run typecheck:node`, `npm run typecheck:web`, and `npm test` all pass.

## Architecture

Manifold follows Electron's multi-process model, where the UI has no direct access to Node.js or the filesystem — all system calls go through a controlled bridge:

- `src/main/`: terminal processes (PTYs), git/worktree operations, workspaces, search, memory, settings, and app lifecycle
- `src/preload/`: the bridge layer — whitelists which Node.js operations the UI is allowed to call
- `src/renderer/`: the developer workspace UI, including the draft-chat app-builder flow
- `src/renderer-shared/`: chat components shared across renderer surfaces
- `src/shared/`: shared types, defaults, prompts, and theme data

For a subsystem-by-subsystem map of the main process — sessions, worktrees, runtimes, memory, search, plugins, and the rest — see the contributor [documentation map](docs/README.md).

For security, embedded web previews are limited to `localhost` URLs only — they cannot load external sites.

## Contributing

Contributions are welcome. A quick outline:

1. Fork the repo and create a branch from `main`.
2. Follow the [Local Development](#local-development) steps to get the app running.
3. Make your change, keeping it focused and small where possible.
4. Run `npm run typecheck:node`, `npm run typecheck:web`, and `npm test` — all must pass.
5. Open a pull request describing the change and the testing you ran.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full contributor setup, code conventions, test commands, and pull request workflow.

## License

Manifold is released under the MIT License. See [LICENSE](LICENSE) for the full text.

## Releasing

Releases happen in two steps so the version bump lands on `main` before the tag is created.

1. Prepare the release PR (choose one based on the change):

```bash
./release.sh patch   # bug fixes and small changes
./release.sh minor   # new features, backwards compatible
./release.sh major   # breaking changes
```

2. After that PR is merged, publish the release:

```bash
./release.sh publish
```
