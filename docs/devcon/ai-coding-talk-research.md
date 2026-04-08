# AI Coding Talk Research And Working Notes

Last updated: 2026-04-08

## Working Title

**How I Code With AI**

Subtitle option:

**Using Manifold as the illustration, not the subject**

## Core Thesis

The big change is not that AI can write code. The big change is that the whole software loop changes:

- implementation gets cheaper
- waiting becomes more visible
- tests and verification matter more
- templates become more valuable
- permissions become workflow design
- parallelism becomes practical, not optional
- review and meeting culture become the new bottlenecks

Manifold belongs in the talk as the concrete harness I built around this loop:

- worktrees for isolation
- multiple engines, not one vendor
- real terminals and review
- memory across sessions
- templates and provisioners

## My Inputs To Preserve

These are the points that should stay visible in the talk:

- Why tests-first development matters so much right now
- The value of repo templates
- Codex vs Claude Code
- Claude Code on the phone
- Agentic AI needs lots of practice
- The recurring question: what should I build next?
- Build first before inviting everyone into a meeting
- PR reviews and how the four-eye principle slows development
- Permissions are about security, but also about productivity
- Claude Code settings and command allowlists matter a lot
- Parallel work matters because agents can take 1 to 45 minutes to return
- Memory matters across sessions
- `claude-mem` is useful, but Manifold had to implement memory itself because it supports more than Claude
- Markdown files help a lot
- Skills are extremely valuable

## A Better Story Arc

Instead of presenting Manifold feature-by-feature, the talk should move like this:

1. AI changed the bottleneck
2. Parallelism and harness design matter
3. The repeatable workflow matters more than the one giant prompt
4. Tests, permissions, and markdown context files are now core engineering tools
5. Claude Code and Codex are both useful, but in different operating modes
6. Repo templates and fast prototyping change what gets built
7. Review, approvals, and meetings now stand out as the slow parts
8. Manifold is the concrete illustration of that whole thesis

## External Research: What Others Keep Repeating

### 1. Verification is the highest-leverage input

Anthropic’s Claude Code best-practices guide is very direct:

- give the agent tests, screenshots, or expected outputs
- let the agent verify its own work
- without verification, the human becomes the only feedback loop

This strongly supports the tests-first point. In practice, “tests” now includes:

- failing tests
- exact commands
- screenshots
- previews
- typecheck
- lint

Takeaway for the talk:

- AI makes tests more important, not less
- tests-first development is now a way of making the agent self-correct

Source:

- [Anthropic: Best Practices for Claude Code](https://code.claude.com/docs/en/best-practices)

### 2. Explore first, then plan, then code

Anthropic recommends explicitly separating:

- exploration
- planning
- implementation
- commit / PR

OpenAI says something very similar for Codex:

- start with Ask Mode
- get an implementation plan first
- then switch to code mode

This matches the current personal workflow almost perfectly:

- intent
- context
- discussion
- spec
- plan
- implement
- verify
- refactor

Practical addition for the talk:

- context windows fill up quickly
- more context is not always better context
- keeping a session on track means loading only what is relevant, splitting work across sessions, and starting fresh when a thread drifts

Takeaway for the talk:

- the workflow is not “prompt better”
- the workflow is “separate phases so the model can do one job well at a time”

Sources:

- [Anthropic: Best Practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [OpenAI: How OpenAI uses Codex](https://openai.com/business/guides-and-resources/how-openai-uses-codex/)

### 3. Context files compound over time

Both Anthropic and OpenAI converge on the same idea:

- repo-level markdown instruction files are extremely valuable

Anthropic:

- `CLAUDE.md` should carry workflow rules, testing instructions, repo etiquette, and non-obvious project knowledge

OpenAI:

- `AGENTS.md` helps Codex operate more effectively across prompts

This supports a dedicated point in the talk about markdown files:

- `CLAUDE.md`
- `AGENTS.md`
- specs
- implementation plans
- architecture notes

These files help because they:

- survive across sessions
- reduce repeated explanations
- make the workflow more team-shareable
- compress taste and rules into something durable

Important nuance from the talk:

- `AGENTS.md` and `CLAUDE.md` should contain things that actually change behavior
- commands, constraints, workflow rules, permissions assumptions, and strong preferences are good candidates
- generic project-structure summaries are only worth keeping if they materially affect how the agent should work
- otherwise they risk becoming documentation noise instead of leverage

Takeaway for the talk:

- markdown files are not documentation overhead
- markdown files are part of the prompt interface for serious agentic coding

Sources:

- [Anthropic: Manage Claude’s memory](https://docs.anthropic.com/en/docs/claude-code/memory)
- [Anthropic: Best Practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [OpenAI: How OpenAI uses Codex](https://openai.com/business/guides-and-resources/how-openai-uses-codex/)

### 4. Permissions are a real workflow design problem

Anthropic’s guidance on permissions is useful because it is honest:

- default approvals are safe
- but repeated approvals become tedious
- after enough prompts, people are no longer really reviewing, they are just clicking through

Claude Code offers ways to reduce that drag:

- auto mode
- permission allowlists
- sandboxing

This directly supports the talk point that permissions are not just a security setting. They are part of velocity design.

Good framing:

- too few permissions: dangerous
- too many prompts: also dangerous, because users stop paying attention
- the goal is not no friction, but the right friction

Talk note:

- mention that the settings / allowlist file has to be very good
- this is where trust, safety, and productivity meet

Source:

- [Anthropic: Best Practices for Claude Code](https://code.claude.com/docs/en/best-practices)

### 5. Parallel work is part of the official best-practice story

Anthropic explicitly documents:

- running multiple Claude sessions
- parallel work on the web
- remote tasks

The docs for Claude Code on the web say it is useful for:

- well-defined tasks
- parallel bug fixes
- repositories not on the local machine
- backend changes where Claude can write tests then code to pass them

It also says Claude Code is available in the Claude app for:

- iOS
- Android

This supports several talk points:

- AI coding is becoming asynchronous
- the phone is not for “serious coding,” but it is real for queueing and monitoring work
- parallelism is not a hack, it is now part of the intended model

Source:

- [Anthropic: Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)

### 6. Repo templates are leverage

GitHub’s template repository docs say a template repo lets people create a new repo with the same:

- directory structure
- branches
- files

This strongly supports the repo template point.

For the talk:

- templates are how good defaults become reusable
- templates reduce the cost of starting the next idea
- templates turn taste into infrastructure

This becomes even stronger when paired with provisioners:

- provisioners are the mechanism
- templates are the reusable substance

Source:

- [GitHub Docs: Creating a template repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository)

### 7. Prototype before debate

Miro’s collaborative prototyping piece makes several useful points:

- prototyping earlier reduces rework
- it creates alignment before assumptions calcify
- speed without shared understanding just accelerates rework

This fits the talk point:

- build first before inviting everyone into a meeting

Good framing:

- AI lowered the cost of building something concrete
- therefore abstract discussion is less defensible than it used to be
- the prototype does not need to be final, it just needs to make the discussion real

Source:

- [Miro: Collaborative prototyping](https://miro.com/prototyping/collaborative-prototyping/)

### 8. Review rules are useful, but they do slow flow

GitHub’s protected branches docs confirm that repos can require:

- a specific number of approving reviews
- code owner reviews
- re-approval after changes

This is useful governance, but it clearly adds latency.

GitHub also documents cases where:

- stale approvals are dismissed
- a changed diff requires approval again
- merge is blocked until required reviews are satisfied

That supports the talk point:

- the four-eye principle is real and useful
- but in an AI-accelerated workflow, review latency becomes much more visible

Good framing:

- AI accelerates coding
- branch protection and PR review still set the merge pace
- this means teams need to think harder about PR size, review batching, and what really needs human eyes

Sources:

- [GitHub Docs: About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub Docs: Approving a pull request with required reviews](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/code-reviews/approving-a-pull-request-with-required-reviews)

### 9. Skills are valuable because they package repeatable expertise

Anthropic’s best-practices guide explicitly calls out:

- create skills
- create subagents
- install plugins

That is important for this talk because skills are one of the best examples of how agentic coding matures:

- one good prompt helps once
- one good skill helps many times

Good talk framing:

- skills are reusable chunks of workflow knowledge
- they are how a personal best practice becomes a durable capability
- they reduce context loading and repeated explanation
- they are one of the cleanest ways to scale yourself without bloating every session

Source:

- [Anthropic: Best Practices for Claude Code](https://code.claude.com/docs/en/best-practices)

### 10. Memory across sessions matters, but multi-engine tools need their own approach

There are two relevant memory stories here:

1. Anthropic’s own memory model
2. `claude-mem`

Anthropic documents multiple memory locations for Claude Code, including:

- enterprise policy
- project memory
- user memory

That validates the idea that memory is part of the coding workflow, not an optional luxury.

Separately, `claude-mem` is a popular project described as:

- automatically capturing what Claude does during coding sessions
- compressing it
- injecting relevant context back into future sessions

That is useful, but the talk should make the Manifold distinction clear:

- `claude-mem` is Claude-specific
- Manifold supports Claude Code, Codex, and other engines
- therefore memory had to be implemented at the Manifold layer

That story is strong because it shows:

- why memory matters
- why multi-engine tooling cannot fully outsource memory to a single vendor plugin
- why markdown files and persisted project notes still matter

Good framing:

- plugins like `claude-mem` prove the demand is real
- Manifold had to generalize the idea because the workflow spans more than Claude
- memory across sessions is one answer to context-window limits, because not everything useful should live inside one live thread

Sources:

- [Anthropic: Manage Claude’s memory](https://docs.anthropic.com/en/docs/claude-code/memory)
- [GitHub: thedotmack/claude-mem](https://github.com/thedotmack/claude-mem)

## How Markdown Files Help

This deserves its own talking point.

Markdown files help because they are:

- durable
- inspectable
- easy to diff
- easy to share
- model-friendly

Useful markdown artifacts in this workflow:

- `CLAUDE.md`
- `AGENTS.md`
- project-specific notes
- one-off feature specs
- implementation plans
- review notes
- session summaries
- “what I learned” documents after experiments

Good line:

> Markdown is one of the simplest ways to turn fleeting context into reusable context.

Better line:

> The most valuable markdown is the markdown that changes what the agent does next.

Context-window line:

> The live context window should stay lean. Stable instructions belong in files, skills, and memory, not in one endlessly growing session.

## Manifold-Specific Angles To Use As Illustration

### Worktrees

- Best illustration of why parallelism matters
- Each agent gets isolation
- Makes 1-to-45-minute wait times much easier to tolerate because other work can keep moving

### Multiple engines

- Strong illustration that the talk is not about one vendor
- Lets me talk honestly about Claude Code and Codex side by side

### Memory

- Strong illustration that cross-session memory is useful
- Strong illustration that a multi-engine tool had to implement memory at its own layer
- Nice bridge into markdown files and shared notes

### Provisioners and templates

- Good way to talk about how defaults become leverage
- Good proof that templates are not theory, but a practical workflow accelerator

### Real terminals and review flow

- Good way to show that verification and review are part of the same loop
- Good way to show why permissions and approvals matter

## Slide Topics That Now Feel Strong

- The bottleneck moved
- Parallelism is not optional
- The harness matters more than the chat box
- Build the harness you want to live in
- Claude Code and Codex both earn a place
- A repeatable loop beats one giant prompt
- Tests first is higher leverage now
- Claude Code on the phone is not a gimmick
- Permissions are a security feature and a productivity tax
- What others keep repeating about agentic coding
- Repo templates are leverage
- What do you build next when building gets cheap?
- Build first before you invite everyone into a meeting
- Agentic AI needs a lot of practice
- The new loop is faster, but waiting did not disappear

## Strong Lines To Reuse

- AI made implementation cheaper. The hard parts now are orchestration, verification, permissions, and deciding what is worth building next.
- If the agent is busy, the human should still be moving.
- The harness matters more than the chat box.
- Markdown is one of the simplest ways to turn fleeting context into reusable context.
- The prototype does not need to be final. It just needs to make the discussion concrete.
- AI coding speeds implementation. The real leverage is how you structure the rest of the loop.

## Claims To Handle Carefully

- Do not imply that Claude Code or Codex removes the need for review.
- Do not imply that permission friction should simply be removed.
- Do not imply that phone-based coding replaces desktop coding.
- Do not imply that templates solve product judgment.
- Do not imply that memory is a solved problem across tools.
- If talking about review friction, make the point as a tradeoff, not as “reviews are bad.”

## Suggested Next Step

Use this document as the source of truth for:

- rewriting the markdown outline
- tightening the slide deck
- deciding what belongs in speaker notes versus on-screen copy

## Sources

- [Anthropic: Best Practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [Anthropic: Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)
- [Anthropic: Manage Claude’s memory](https://docs.anthropic.com/en/docs/claude-code/memory)
- [Anthropic: Common workflows](https://code.claude.com/docs/en/tutorials)
- [OpenAI: How OpenAI uses Codex](https://openai.com/business/guides-and-resources/how-openai-uses-codex/)
- [OpenAI: Introducing upgrades to Codex](https://openai.com/index/introducing-upgrades-to-codex/)
- [GitHub Docs: Creating a template repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository)
- [GitHub Docs: About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub Docs: Approving a pull request with required reviews](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/code-reviews/approving-a-pull-request-with-required-reviews)
- [Miro: Collaborative prototyping](https://miro.com/prototyping/collaborative-prototyping/)
- [GitHub: thedotmack/claude-mem](https://github.com/thedotmack/claude-mem)
