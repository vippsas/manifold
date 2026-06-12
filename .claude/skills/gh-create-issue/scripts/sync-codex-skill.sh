#!/usr/bin/env bash

set -euo pipefail

skill_name="gh-create-issue"

repo_root=""
if git_root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  if [ -f "$git_root/.claude/skills/$skill_name/SKILL.md" ]; then
    repo_root="$git_root"
  fi
fi

if [ -z "$repo_root" ]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  candidate_root="$(cd "$script_dir/../../../.." && pwd)"
  if [ -f "$candidate_root/.claude/skills/$skill_name/SKILL.md" ]; then
    repo_root="$candidate_root"
  fi
fi

if [ -z "$repo_root" ]; then
  echo "Could not find the Manifold repo root for $skill_name." >&2
  exit 1
fi

src_dir="$repo_root/.claude/skills/$skill_name"
target_dir="$HOME/.codex/skills/$skill_name"

mkdir -p "$target_dir/scripts"
cp "$src_dir/SKILL.md" "$target_dir/SKILL.md"
cp "$src_dir/scripts/upload-assets.sh" "$target_dir/scripts/upload-assets.sh"
cp "$src_dir/scripts/sync-codex-skill.sh" "$target_dir/scripts/sync-codex-skill.sh"

sed -i.bak 's|bash \.claude/skills/gh-create-issue/scripts/upload-assets\.sh|bash ~/.codex/skills/gh-create-issue/scripts/upload-assets.sh|g' "$target_dir/SKILL.md"
sed -i.bak 's|bash \.claude/skills/gh-create-issue/scripts/sync-codex-skill\.sh|bash ~/.codex/skills/gh-create-issue/scripts/sync-codex-skill.sh|g' "$target_dir/SKILL.md"
rm -f "$target_dir/SKILL.md.bak"

chmod +x "$target_dir/scripts/upload-assets.sh" "$target_dir/scripts/sync-codex-skill.sh"

echo "synced $skill_name to $target_dir"
