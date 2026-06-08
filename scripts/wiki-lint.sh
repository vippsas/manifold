#!/usr/bin/env bash
#
# wiki-lint — drift checks for Manifold's documentation wiki (see docs/llm-wiki.md).
#
# Tracks two kinds of pages:
#   - docs/architecture/*.md      → `covers: [..]` in YAML frontmatter
#   - any file outside docs/ with → `<!-- wiki-covers: a, b -->` (e.g. README.md)
#
# Checks:
#   - broken covers refs      a bound path no longer exists on disk          (FAIL)
#   - missing subsystem pages  a src/main/* area with no covering page         (FAIL)
#   - orphans                  an architecture page absent from the doc map    (FAIL)
#   - frozen-spec misuse       a living page citing a superpowers/planning/    (FAIL)
#                              research spec as if current
#   - staleness (git gap)      commits hit a page's covers path after the page (WARN)
#                              was last touched
#
# Structural problems exit non-zero. Staleness is informational (the signal a
# self-firing doc-sync agent acts on), printed but not failing.
#
# Usage:   bash scripts/wiki-lint.sh
# Env:     WIKI_STALE_THRESHOLD=N   stale when gap > N commits (default 0)

set -o pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

THRESHOLD="${WIKI_STALE_THRESHOLD:-0}"
fail=0
stale=0
tracked=0

# Print "<doc>\t<space-separated covers>" for every tracked page.
collect_pages() {
  local f line covers
  for f in docs/architecture/*.md; do
    [ -e "$f" ] || continue
    line=$(grep -m1 '^covers:' "$f")
    if [ -z "$line" ]; then echo "MISSING-FRONTMATTER	$f" ; continue; fi
    covers=$(printf '%s' "$line" | sed -e 's/.*\[//' -e 's/\].*//' -e 's/,/ /g')
    printf '%s\t%s\n' "$f" "$covers"
  done
  # HTML-comment-bound files: content docs that can't carry YAML frontmatter.
  # Restrict to the marker at line start and skip docs/ and scripts/ so the
  # convention's own documentation doesn't self-match.
  git grep -lE '^<!-- wiki-covers:' -- . ':(exclude)docs' ':(exclude)scripts' \
      ':(exclude)CLAUDE.md' ':(exclude)AGENTS.md' 2>/dev/null \
  | while IFS= read -r f; do
      line=$(grep -m1 'wiki-covers:' "$f")
      covers=$(printf '%s' "$line" | sed -e 's/.*wiki-covers://' -e 's/-->.*//' -e 's/,/ /g')
      printf '%s\t%s\n' "$f" "$covers"
    done
}

echo "== wiki-lint =="

# --- per-page checks: broken refs + staleness ---
while IFS=$'\t' read -r doc covers; do
  if [ "$doc" = "MISSING-FRONTMATTER" ]; then
    echo "FAIL  no covers: frontmatter — $covers"; fail=1; continue
  fi
  tracked=$((tracked + 1))

  for p in $covers; do
    [ -e "$p" ] || { echo "FAIL  broken covers ref: $doc → $p"; fail=1; }
  done

  doc_hash=$(git log -1 --format=%h -- "$doc")
  if [ -n "$doc_hash" ]; then
    gap=$(git rev-list --count "${doc_hash}..HEAD" -- $covers 2>/dev/null)
    if [ "${gap:-0}" -gt "$THRESHOLD" ]; then
      echo "STALE $gap commit(s) since updated: $doc  ⇐  $covers"
      stale=$((stale + 1))
    fi
  fi
done < <(collect_pages)

# --- missing subsystem pages ---
for d in src/main/*/; do
  n=$(basename "$d")
  grep -rql "src/main/$n\b" docs/architecture/ >/dev/null \
    || { echo "FAIL  no page covers src/main/$n"; fail=1; }
done

# --- orphans (architecture page missing from the doc map) ---
for f in docs/architecture/*.md; do
  b=$(basename "$f")
  grep -q "architecture/$b" docs/README.md \
    || { echo "FAIL  orphan (not in docs/README.md): $b"; fail=1; }
done

# --- frozen-spec misuse ---
if git grep -nE 'docs/(superpowers|planning|research)/' -- docs/architecture/ >/dev/null 2>&1; then
  echo "FAIL  living page cites a frozen spec as current:"
  git grep -nE 'docs/(superpowers|planning|research)/' -- docs/architecture/
  fail=1
fi

echo "--"
echo "tracked pages: $tracked   stale: $stale   threshold: >$THRESHOLD commit(s)"
if [ "$fail" -eq 0 ]; then
  echo "structural checks: PASS"
else
  echo "structural checks: FAILED"
fi
exit $fail
