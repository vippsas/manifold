#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  ./release.sh patch
  ./release.sh minor
  ./release.sh major
  ./release.sh publish
EOF
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: '$1' is required but was not found in PATH." >&2
    exit 1
  fi
}

ensure_clean_worktree() {
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Error: working tree must be clean before running release.sh." >&2
    exit 1
  fi

  if [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    echo "Error: working tree must be clean before running release.sh." >&2
    exit 1
  fi
}

parse_package_version_from_stdin() {
  node -e "
    let input = '';
    process.stdin.on('data', (chunk) => {
      input += chunk;
    });
    process.stdin.on('end', () => {
      const pkg = JSON.parse(input);
      if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
        console.error('Error: package.json is missing a version.');
        process.exit(1);
      }

      process.stdout.write(pkg.version);
    });
  "
}

get_local_package_version() {
  node -p "require('./package.json').version"
}

get_package_version_at_ref() {
  local ref="$1"
  git show "${ref}:package.json" | parse_package_version_from_stdin
}

calculate_next_version() {
  local current_version="$1"
  local release_type="$2"

  node -e "
    const currentVersion = process.argv[1];
    const releaseType = process.argv[2];
    const parts = currentVersion.split('.').map(Number);

    if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
      console.error('Error: package.json version must use major.minor.patch format.');
      process.exit(1);
    }

    let [major, minor, patch] = parts;

    switch (releaseType) {
      case 'patch':
        patch += 1;
        break;
      case 'minor':
        minor += 1;
        patch = 0;
        break;
      case 'major':
        major += 1;
        minor = 0;
        patch = 0;
        break;
      default:
        console.error('Error: invalid release type.');
        process.exit(1);
    }

    process.stdout.write([major, minor, patch].join('.'));
  " "$current_version" "$release_type"
}

ensure_remote_tag_absent() {
  local tag="$1"

  if git rev-parse --verify --quiet "refs/tags/$tag" >/dev/null; then
    echo "Error: tag '$tag' already exists locally." >&2
    exit 1
  fi

  if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
    echo "Error: tag '$tag' already exists on origin." >&2
    exit 1
  else
    local remote_tag_status=$?
    if [[ "$remote_tag_status" -ne 2 ]]; then
      echo "Error: unable to verify whether tag '$tag' exists on origin." >&2
      exit 1
    fi
  fi
}

ensure_release_absent() {
  local tag="$1"

  if gh release view "$tag" >/dev/null 2>&1; then
    echo "Error: GitHub release '$tag' already exists." >&2
    exit 1
  fi
}

prepare_release() {
  local release_type="$1"
  local current_branch start_branch main_version next_version tag release_branch
  local current_version new_version pr_url pr_title pr_body

  # Avoid syncing tags here; stale or divergent local tags can make fetch fail,
  # and remote tag existence is checked explicitly with git ls-remote below.
  git fetch --no-tags origin main >/dev/null

  main_version="$(get_package_version_at_ref "origin/main")"
  next_version="$(calculate_next_version "$main_version" "$release_type")"
  tag="v${next_version}"
  release_branch="release/${tag}"

  current_branch="$(git branch --show-current)"
  if [[ -z "$current_branch" ]]; then
    echo "Error: release.sh must be run from a branch, not detached HEAD." >&2
    exit 1
  fi
  start_branch="$current_branch"

  if git show-ref --verify --quiet "refs/heads/$release_branch"; then
    echo "Error: local branch '$release_branch' already exists." >&2
    exit 1
  fi

  if git ls-remote --exit-code --heads origin "$release_branch" >/dev/null 2>&1; then
    echo "Error: remote branch '$release_branch' already exists." >&2
    exit 1
  else
    local remote_branch_status=$?
    if [[ "$remote_branch_status" -ne 2 ]]; then
      echo "Error: unable to verify whether branch '$release_branch' exists on origin." >&2
      exit 1
    fi
  fi

  echo "Switching current worktree from ${start_branch} to ${release_branch} based on origin/main."
  git switch -c "$release_branch" origin/main >/dev/null
  current_branch="$release_branch"

  current_version="$(get_local_package_version)"
  if [[ "$current_version" != "$main_version" ]]; then
    echo "Error: local package.json version does not match origin/main after switching to '$release_branch'." >&2
    exit 1
  fi

  ensure_remote_tag_absent "$tag"

  npm version "$release_type" --no-git-tag-version >/dev/null
  new_version="$(get_local_package_version)"

  if [[ "$new_version" != "$next_version" ]]; then
    echo "Error: expected version '$next_version' but found '$new_version' after bump." >&2
    exit 1
  fi

  if [[ -f "package-lock.json" ]]; then
    git add package.json package-lock.json
  else
    git add package.json
  fi

  git commit -m "Bump version from ${current_version} to ${new_version}"
  git push -u origin "HEAD:${current_branch}"

  pr_url="$(
    gh pr list --head "$current_branch" --base main --state open --json url --jq '.[0].url // empty'
  )"

  if [[ -z "$pr_url" ]]; then
    pr_title="Bump version from ${current_version} to ${new_version}"
    pr_body=$(
      cat <<EOF
This PR prepares release v${new_version}.

After this PR is merged into \`main\`, run \`./release.sh publish\` from a clean checkout to create the tag and GitHub release.
EOF
    )
    pr_url="$(gh pr create --base main --head "$current_branch" --title "$pr_title" --body "$pr_body")"
    echo "Created release PR: $pr_url"
  else
    echo "Updated existing release PR: $pr_url"
  fi

  echo "Release preparation complete for v${new_version} on branch ${current_branch}."
  echo "Current worktree remains on ${current_branch}."
  echo "After manual approval and merge into main, run ./release.sh publish."
}

publish_release() {
  local main_sha main_version tag

  # Avoid syncing tags here; stale or divergent local tags can make fetch fail,
  # and remote tag existence is checked explicitly with git ls-remote below.
  git fetch --no-tags origin main >/dev/null

  main_sha="$(git rev-parse origin/main)"
  main_version="$(get_package_version_at_ref "origin/main")"
  tag="v${main_version}"

  ensure_remote_tag_absent "$tag"
  ensure_release_absent "$tag"

  git tag -a "$tag" "$main_sha" -m "Release $tag"
  git push origin "$tag"

  if ! gh release create "$tag" --verify-tag --generate-notes; then
    echo "Error: failed to create GitHub release '$tag'. The tag was pushed, so the release workflow may still create or update it." >&2
    exit 1
  fi

  echo "Created $tag from origin/main at $main_sha."
}

if [[ $# -ne 1 ]]; then
  usage
fi

release_action="$1"

case "$release_action" in
  patch|minor|major|publish)
    ;;
  *)
    usage
    ;;
esac

require_command git
require_command npm
require_command node
require_command gh

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Error: git remote 'origin' is not configured." >&2
  exit 1
fi

ensure_clean_worktree

if ! gh auth status >/dev/null 2>&1; then
  echo "Error: GitHub CLI is not authenticated. Run 'gh auth login' and try again." >&2
  exit 1
fi

if [[ "$release_action" == "publish" ]]; then
  publish_release
else
  prepare_release "$release_action"
fi
