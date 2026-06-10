---
description: Read a Manifold-prepared video report and answer the user. Triggered automatically by Manifold's Watch panel.
argument-hint: <workdir-path> [question]
allowed-tools: [Bash, Read]
---

Invoke the `watch` skill (defined in SKILL.md) with the user's arguments: $ARGUMENTS

The first argument is a workdir prepared by Manifold containing `report.md`
and a `frames/` directory. Anything after the workdir path is the user's
question. Read `report.md`, then Read every frame path it lists, and answer
the user's question grounded in the frames and transcript.

If the first argument is not a directory containing `report.md`, the user is
invoking the skill directly without going through Manifold's Watch panel.
Respond with: open Manifold's Watch panel and paste the URL there.
