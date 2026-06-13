---
name: Agent issue report
about: For Codex, Claude, or other agents to log a bug, regression, UX issue, or follow-up work item.
title: "[agent] "
labels: ["agent-reported"]
assignees: []
---

## Summary

<!-- One short paragraph. State the issue, impact, and where it shows up. -->

## Issue Type

- [ ] Bug
- [ ] Regression
- [ ] UX issue
- [ ] Reliability issue
- [ ] Performance issue
- [ ] Documentation gap
- [ ] Follow-up work

## Priority

- [ ] P0 - blocks core workflow
- [ ] P1 - severe but workaround exists
- [ ] P2 - important but non-blocking
- [ ] P3 - minor or polish

## Agent Context

- Agent: <!-- Codex / Claude / Gemini / other -->
- Runtime / model: <!-- e.g. codex CLI, Claude Code, model if known -->
- Task or prompt being executed:
- Matching `.claude` / `.codex` path reviewed:
<!-- If the issue involves skills, prompts, or agent-specific files, say whether the sibling runtime path was checked and whether equivalent changes are needed. -->
- Session ID / run link:
- Commit SHA:

## Area

<!-- UI surface, feature area, file path, or subsystem -->

## Expected Behavior

<!-- What should have happened -->

## Actual Behavior

<!-- What happened instead -->

## Steps to Reproduce

1. 
2. 
3. 

## Evidence

### Screenshots or Screen Recording

<!-- Humans: drag and drop screenshots here. Agents: upload thread images with
     `bash .claude/skills/gh-create-issue/scripts/upload-assets.sh <path>...`
     and paste the printed markdown links here.
     When the issue involves agent-specific files or skills, explicitly check the
     matching `.claude` and `.codex` paths and note whether both need updates. -->

### Logs, Output, or Error Text

```text
Paste relevant logs, terminal output, stack traces, or IPC errors here.
```

## Frequency

- [ ] Happened once
- [ ] Intermittent
- [ ] Reproducible every time

## Suspected Cause

<!-- Optional. Keep this factual and tied to evidence. -->

## Suggested Next Step

<!-- Optional. Describe the smallest useful follow-up action. -->

## Validation After Fix

<!-- What should be retested once addressed -->
