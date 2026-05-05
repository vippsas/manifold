---
name: watch
description: Watch a video that Manifold has pre-staged. Manifold's main process downloads the video, extracts auto-scaled frames with ffmpeg, and produces a timestamped transcript (native captions or gpt-4o-transcribe). This skill receives the report path and tells Claude to read each frame.
argument-hint: "<workdir-path-or-url> [question]"
allowed-tools: Bash, Read
license: MIT
user-invocable: true
---

# /watch — Claude watches a Manifold-prepared video

The Manifold desktop app (this skill is bundled with it) does all the heavy
lifting in its main process. When the user clicks **Run** in the Watch panel,
Manifold:

1. Downloads the video with `yt-dlp` (or resolves the local path)
2. Extracts auto-scaled JPEG frames with `ffmpeg`
3. Pulls native captions, or falls back to `gpt-4o-transcribe` (OpenAI or Azure)
4. Writes a `report.md` plus `frames/frame_*.jpg` into a temp working directory
5. Pastes `/watch:watch <workdir>` into the active Claude Code agent

Your job in this skill is **only** to:

1. Read the pre-staged `report.md` (path is the first argument)
2. Read each frame path the report lists
3. Answer the user's question (if any) using frames + transcript

## Step 1 — load the report

```bash
cat "$1/report.md"
```

If `$1` does not look like a directory containing `report.md`, the user invoked
`/watch:watch <url>` directly without the Watch panel. In that case, respond:

> Direct CLI invocation is not supported in this build. Open Manifold's **Watch**
> panel, paste the URL, and click Run. Manifold will download the video and
> hand the prepared frames back to me.

## Step 2 — read every frame

The report lists frame paths under "## Frames" with `t=MM:SS` timestamps. Use
the `Read` tool on every frame path in a single message (parallel tool calls)
so you see them together. The transcript section gives you the spoken content
aligned to the same timeline.

## Step 3 — answer

If the user asked a specific question (everything after the workdir path),
answer it directly, citing timestamps. If no question was asked, summarize the
video — structure, key moments, notable visuals, spoken content.

## Cleanup

The report ends with a `Work dir: ...` line. Manifold owns the directory's
lifecycle; do not delete it yourself.
