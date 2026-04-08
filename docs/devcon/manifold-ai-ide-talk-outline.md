# AI Coding Talk Outline

## Working Title

**How I Code With AI**

Subtitle option:

**Using Manifold as the illustration, not the subject**

## Source Material

This outline is based on:

- the current Manifold repository
- the working research notes in `docs/devcon/ai-coding-talk-research.md`
- your stated workflow and emphasis areas
- current public documentation from Anthropic, OpenAI, GitHub, Miro, and `claude-mem`

## Core Message

AI made implementation cheaper, but it made workflow design more important.

The important things now are:

- tests and verification
- parallel work
- repo templates
- permissions
- markdown context files
- skills
- better judgment about what to build next

Manifold is useful in the talk because it is a concrete illustration of that entire loop.

## Recommended Framing

This should not sound like:

- “Here is my AI IDE”

It should sound like:

- “Here is how I actually build with AI now, and here is the tool I built around that workflow”

## 60-Minute Run Of Show

Target: 52 to 55 minutes of presentation, 5 to 8 minutes for questions.

| Time | Section | Purpose |
| --- | --- | --- |
| 0:00-0:08 | Why the bottleneck changed | Reframe AI coding as a workflow shift, not a code-generation trick |
| 0:08-0:16 | Parallelism and harness | Show why worktrees, isolation, and owning the harness matter |
| 0:16-0:30 | Workflow, tests, context, permissions | Teach the loop that actually works in practice |
| 0:30-0:40 | Claude Code, Codex, async surfaces | Explain tool choice and the move toward asynchronous coding |
| 0:40-0:52 | Templates, prototyping, next bets | Show how cheap building changes starting points and decision-making |
| 0:52-0:55 | Reviews, waiting, closing | Close on the idea that waiting did not disappear, it moved |
| 0:55-1:00 | Q&A | Reserve time for practical tradeoffs |

## Slide-By-Slide Outline

### 1. Opening

**Time:** 2 minutes

- Open with the new thesis: this talk is about how I code with AI.
- Manifold is the harness I built around that workflow.
- The subject is not “my IDE.”
- The subject is the new software loop.

**Key line:**

> AI made implementation cheaper. The hard parts now are orchestration, verification, permissions, and deciding what is worth building next.

### 2. Agenda

**Time:** 1 minute

- Show the room that the talk will move from:
  - bottleneck shift
  - parallelism and harness
  - workflow, tests, context, permissions
  - tool choice
  - templates and prototyping
  - reviews and waiting

### 3. The Bottleneck Moved

**Time:** 5 minutes

- Typing is cheaper than before.
- Agent latency is now part of normal development.
- A task can take 1 to 45 minutes to come back.
- That means serial work wastes time.
- Verification, review, and decision-making are now much more visible bottlenecks.

**Talking angle:**

- AI did not remove friction.
- It moved friction to different parts of the loop.

### 4. Parallelism Is Not Optional

**Time:** 6 minutes

- If the agent is busy, the human should still be moving.
- Worktrees are the most concrete answer to this.
- One repo, many isolated working directories, many agents.
- This is why Manifold started with worktrees.

**Key line:**

> Parallelism is not a luxury feature. It is the practical answer to agent wait time.

### 5. The Harness Matters More Than The Chat Box

**Time:** 5 minutes

- The workflow around the model matters as much as the model.
- Repo instructions matter.
- Permissions matter.
- Isolation matters.
- Review surfaces matter.

What belongs in the harness:

- `CLAUDE.md`
- `AGENTS.md`
- permissions and allowlists
- worktrees
- tests
- diff review
- templates
- memory

Important nuance:

- `CLAUDE.md` and `AGENTS.md` are valuable when they change behavior
- commands, workflow rules, constraints, preferences, and non-obvious gotchas are useful
- generic project structure descriptions are only worth keeping if they actually affect execution

### 6. Build The Harness You Want To Live In

**Time:** 4 minutes

- The best part of building your own IDE is that it can become exactly what you want.
- Every repeated annoyance can become a tool.
- Every new workflow can become a surface.
- The harness compounds over time.

**Narrative angle:**

- I am not just building software in the IDE.
- I am also shaping the IDE around the way I build.

### 7. Claude Code And Codex Both Earn A Place

**Time:** 4 minutes

- I do not treat this as a one-tool workflow.
- Claude Code is strong for interactive terminal-native work.
- Codex is strong for delegated background tasks and PR-shaped execution.
- OpenAI’s own guidance around Codex also reinforces Ask mode first, issue-shaped tasks, and durable repo instructions like `AGENTS.md`.
- The point is not which one “wins.”
- The point is which operating mode fits the task.

**Key line:**

> The better question is not “which model is best?” It is “which operating mode fits this job?”

### 8. My Agentic Workflow

**Time:** 5 minutes

- Intent
- Context
- Discussion
- Specification
- Plan
- Implementation
- Verification
- Refactor

Operational defaults:

- use the best model available
- use the highest reasoning effort for serious work
- use Claude Code with the Superpowers plugin when useful
- separate phases instead of asking for everything at once
- load only the relevant context instead of stuffing everything into one session
- when the thread drifts, split the task, compact it, or start fresh

Important framing:

- context windows fill up fast
- more context is not automatically better
- keeping the session on track is now part of the skill

### 9. Why Tests-First Matters More Now

**Time:** 5 minutes

- Anthropic says verification is the single highest-leverage thing you can give the agent.
- Tests let the agent check itself instead of routing everything back through you.
- Tests-first now also includes:
  - expected outputs
  - screenshots
  - previews
  - typecheck
  - lint

**Key line:**

> AI makes tests more important, not less.

### 10. Manifold As The Concrete Harness

**Time:** 5 minutes

- Use Manifold as the concrete illustration of this whole workflow.
- Parallel agents
- Worktree isolation
- Real terminals
- Diff review
- Search and memory
- PR flow

**Suggested demo angle:**

- show two tasks in flight
- show one returning while another is still running
- show the human staying productive instead of waiting

### 11. Claude Code On The Phone

**Time:** 3 minutes

- Claude Code on the web and mobile matters because it changes the rhythm of coding.
- It is useful for:
  - well-defined tasks
  - monitoring progress
  - queueing work on the go
- The deeper point is asynchronous coding.

**Important nuance:**

- this is not “serious coding moved to the phone”
- this is “dead time is now usable for task orchestration”

### 12. Permissions Are Security And Workflow

**Time:** 4 minutes

- Permissions are about security.
- They are also about velocity.
- Too many approval prompts slow work and train people to spam approve.
- Anthropic explicitly acknowledges this problem.
- Auto mode, allowlists, and sandboxing are how that gets managed.

**Must mention:**

- the settings file and command allowlist have to be good
- this is not a side detail, it is part of workflow quality

### 13. Repo Templates Are Leverage

**Time:** 4 minutes

- Repo templates make good defaults reusable.
- GitHub templates preserve structure, files, and optionally branches.
- Provisioners are how Manifold operationalizes this.
- Templates make starting the next build cheap.

**Key line:**

> Templates turn taste into infrastructure.

### 14. What Do You Build Next?

**Time:** 3 minutes

- When building gets cheaper, choosing gets harder.
- The question comes back all the time: what next?
- Good build candidates are:
  - repeated friction
  - reusable workflow improvements
  - things that help future work, not just one task

**Narrative angle:**

- cheap implementation raises the bar for judgment

### 15. Build First Before Inviting Everyone Into A Meeting

**Time:** 3 minutes

- AI lowers the cost of a quick prototype.
- A rough build often creates better discussion than an abstract meeting.
- Miro’s prototyping research supports this: prototyping early reduces rework and creates alignment sooner.
- This is one of the strongest places where outside guidance and personal experience line up.

**Key line:**

> The prototype does not need to be final. It just needs to make the discussion concrete.

### 16. Agentic AI Needs Practice

**Time:** 3 minutes

- There is a real learning curve.
- You need instincts for:
  - task sizing
  - context loading
  - context cleanup
  - when to interrupt
  - when to parallelize
  - when to stop
- Skills are valuable because they package repeatable knowledge.

**Important point:**

- one good prompt helps once
- one good skill helps many times

### 17. Memory And Markdown Matter

**Time:** 3 minutes

- Live context windows fill up quickly and degrade if too much irrelevant material accumulates.
- Memory across sessions is highly valuable.
- `claude-mem` proves the demand is real.
- But Manifold needed its own memory layer because it supports more than Claude.
- Markdown files help make memory durable:
  - `CLAUDE.md`
  - `AGENTS.md`
  - specs
  - plans
  - session notes
  - architecture notes

**Key line:**

> Markdown is one of the simplest ways to turn fleeting context into reusable context.

Important nuance:

- markdown files should earn their place by changing what the agent does
- if a note does not alter behavior, prioritization, commands, or constraints, it may not belong in `CLAUDE.md` or `AGENTS.md`
- markdown and skills are also how you keep stable instructions out of the live context window

### 18. Closing: Reviews, Waiting, And The New Loop

**Time:** 3 minutes

- Agents still make you wait.
- Reviews still make you wait.
- Meetings still make you wait.
- The four-eye principle is useful, but required approvals, stale-review resets, and large PRs clearly slow flow.
- The workflow skill now is deciding where that waiting is worth it.
- End with one small meta example: even this presentation was vibe coded because it was faster than copying ChatGPT output into PowerPoint.

**Closing sentence:**

> AI coding speeds implementation. The real leverage is how you structure the rest of the loop.

### 19. Q&A

**Time:** 5 minutes

Useful seed questions:

- Why are tests more important now?
- How do you split work between Claude Code and Codex?
- What belongs in repo templates?
- How much review is enough before flow dies?
- What belongs in markdown versus memory versus the tool itself?

## What To Emphasize Repeatedly

- Implementation got cheaper
- Waiting got more visible
- Parallelism matters
- Tests matter more
- Repo templates are leverage
- Permissions are workflow design
- Context discipline is workflow design
- Markdown files are durable context
- Behavior-changing markdown is more valuable than descriptive markdown
- Skills are reusable expertise
- Manifold is the illustration, not the whole thesis

## What To Avoid

- Do not frame this as a “my tool is better than your tool” talk.
- Do not frame reviews as useless.
- Do not frame the phone workflow as replacing desktop engineering.
- Do not frame permissions as pure friction with no security value.
- Do not imply memory is solved.

## Suggested Trim If Time Runs Long

- Shorten the Claude Code vs Codex section by 2 minutes
- Fold the mobile/phone point into the async section
- Shorten the “what to build next” section by 1 minute
- Keep the tests, templates, permissions, and closing sections intact
