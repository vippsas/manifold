# Orchestrate Skill Design

## Identity

- **Name:** `orchestrate`
- **Location:** `.claude/skills/orchestrate/SKILL.md` (project-local)
- **Trigger:** `/orchestrate <path-to-spec>` or requests like "build from spec" / "implement this specification"
- **Argument:** Path to a markdown spec file
- **Execution:** Fully autonomous, no user gates. Runs all phases end-to-end.

## Pipeline Architecture

Three sequential stages with parallel fan-out in Stage 2:

```
Stage 1 (Sequential)          Stage 2 (Parallel)              Stage 3 (Sequential)
─────────────────────         ──────────────────────           ─────────────────────
Phase 1: Plan from spec  ──►  Phase 3: Write tests      ──►  Phase 6: Chrome UI testing
Phase 2: Implement plan  ──►  Phase 4: Refactor code         Phase 7: Security fix
                              Phase 5: Best practices check
                              (loop back to 4 if needed)
```

### Stage 1 — Foundation (sequential, single agent)

**Phase 1: Plan from spec**
- Read the spec file passed as argument
- Identify components, modules, data flow, dependencies
- Produce a structured implementation plan with build order
- Save plan to `docs/plans/YYYY-MM-DD-<topic>-plan.md`
- The plan lists concrete files to create/modify with descriptions

**Phase 2: Implement**
- Follow the plan file step by step
- Create project scaffolding if needed (package.json, tsconfig, etc.)
- Write all source code files
- Install dependencies
- Verify the project compiles/builds with no errors before moving on

### Stage 2 — Quality (parallel subagents)

File ownership to avoid conflicts: test subagent creates new `*.test.*` files only, refactor subagent modifies existing source files only.

**Phase 3: Write tests (subagent)**
- Read the implementation plan + source files
- Create test files alongside source (`*.test.ts` / `*.test.tsx`)
- Unit tests for utility functions, hooks, modules
- Integration tests for component interactions
- Run the test suite, fix test code bugs (flag source bugs)

**Phase 4: Refactor (subagent)**
- Max 300 lines per file, max ~30 lines per function
- Extract long functions into smaller named functions
- Proper TypeScript types (no `any`, explicit return types on exports)
- React best practices (proper hook usage, memoization where needed, component decomposition)
- Remove dead code, unused imports

**Phase 5: Best practices check (subagent)**
- Review refactored code against checklist:
  - File length <= 300 lines
  - Function length <= ~30 lines
  - No `any` types
  - No console.log in production code
  - Proper error handling (no swallowed errors)
  - Consistent naming (camelCase functions, PascalCase components)
- If violations: refactor again (max 2 total iterations of phases 4-5)
- If clean: proceed

### Stage 3 — Validation (sequential, single agent)

**Phase 6: Chrome UI testing**
- Build the Electron app
- Launch it
- Use Claude in Chrome tools to navigate UI, click buttons, fill forms
- Verify core user flows work
- Report pass/fail with screenshots

**Phase 7: Security fix**
- Run `npm audit` for dependency vulnerabilities
- Scan for hardcoded secrets/API keys
- Code review for OWASP top 10: XSS, injection, insecure IPC patterns
- Auto-fix what's fixable, flag unfixable issues in terminal output

## Tech Stack Focus

TypeScript/React rules hardcoded:
- Max 300 lines per file
- Max ~30 lines per function
- No `any` types
- Explicit return types on exports
- React best practices (hooks, memoization, component decomposition)
- camelCase functions, PascalCase components

## Output

**Files created:**
- `docs/plans/YYYY-MM-DD-<topic>-plan.md` — implementation plan
- Source code files as defined in the plan
- `*.test.ts` / `*.test.tsx` test files alongside source

**Terminal summary:**
- Files created/modified (count)
- Test results (pass/fail counts)
- Refactor iterations performed (1 or 2)
- Best practices compliance (pass/fail per rule)
- Chrome UI test results (pass/fail per flow)
- Security fixes applied (count) + unfixable issues flagged with file/line

**No git commits created.** User decides when to commit.
