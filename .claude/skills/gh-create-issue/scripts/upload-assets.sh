#!/usr/bin/env bash
# Upload local image files to the repo's `issue-assets` branch and print a
# markdown image link per file, ready to embed in a GitHub issue body.
#
# GitHub has no API for attaching images to issues, so this hosts them as
# commits on a dedicated orphan branch and links them via raw.githubusercontent.com
# (renders in issue markdown for public repos; private repos cannot hotlink raw files).
#
# Usage: upload-assets.sh [--repo owner/name] <image-file> [<image-file>...]
# Requires: gh authenticated with push access to the repo.
set -euo pipefail

BRANCH="issue-assets"
REPO=""

usage() {
  echo "Usage: $(basename "$0") [--repo owner/name] <image-file> [<image-file>...]"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) break ;;
  esac
done

if [ $# -eq 0 ]; then
  usage >&2
  exit 1
fi

if [ -z "$REPO" ]; then
  REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
fi

# Bootstrap the orphan asset branch on first use: a parentless commit holding
# only a README, created through the git data API (the contents API cannot
# target a branch that does not exist yet).
ensure_branch() {
  if gh api "repos/$REPO/git/ref/heads/$BRANCH" --silent 2>/dev/null; then
    return
  fi
  echo "Creating orphan branch '$BRANCH' on $REPO" >&2
  local readme blob tree commit
  readme=$(printf '# Issue assets\n\nScreenshots uploaded by the gh-create-issue skill so they can be embedded in issue bodies.\n' | base64 | tr -d '\n')
  blob=$(gh api "repos/$REPO/git/blobs" -f encoding=base64 -f "content=$readme" --jq .sha)
  tree=$(gh api "repos/$REPO/git/trees" \
    -f "tree[][path]=README.md" -f "tree[][mode]=100644" \
    -f "tree[][type]=blob" -f "tree[][sha]=$blob" --jq .sha)
  commit=$(gh api "repos/$REPO/git/commits" \
    -f message="chore: initialize issue-assets branch" -f "tree=$tree" --jq .sha)
  gh api "repos/$REPO/git/refs" -f ref="refs/heads/$BRANCH" -f "sha=$commit" --silent
}

for img in "$@"; do
  if [ ! -f "$img" ]; then
    echo "Error: not a readable file: $img" >&2
    exit 1
  fi
done

ensure_branch

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

for img in "$@"; do
  base=$(basename "$img")
  safe=$(printf '%s' "$base" | tr -c 'A-Za-z0-9._-' '-')
  name="$(date -u +%Y%m%d-%H%M%S)-$RANDOM-$safe"
  # Image payloads exceed ARG_MAX, so pass the base64 body via @file.
  base64 < "$img" | tr -d '\n' > "$tmp"
  gh api -X PUT "repos/$REPO/contents/images/$name" \
    -f message="chore: upload issue asset $safe" \
    -f branch="$BRANCH" \
    -F "content=@$tmp" --silent
  echo "![$base](https://raw.githubusercontent.com/$REPO/$BRANCH/images/$name)"
done
