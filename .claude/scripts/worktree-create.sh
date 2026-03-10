#!/usr/bin/env bash
set -euo pipefail

# Read worktree name from stdin (JSON: {"name": "..."})
NAME=$(jq -r .name)

# Derive project name from the git repo root directory name
REPO_ROOT=$(git rev-parse --show-toplevel)
PROJECT_NAME=$(basename "$REPO_ROOT")

# Place worktrees in ../claude-worktree/<project>/<name> relative to repo
WORKTREE_DIR="$(dirname "$REPO_ROOT")/claude-worktree/$PROJECT_NAME/$NAME"

# Create the worktree (all git output to stderr)
git worktree add "$WORKTREE_DIR" -b "worktree-$NAME" >&2

# Copy .env from repo root if it exists
if [ -f "$REPO_ROOT/.env" ]; then
  cp "$REPO_ROOT/.env" "$WORKTREE_DIR/.env"
  echo "Copied .env" >&2
fi

# Install dependencies
(cd "$WORKTREE_DIR" && bun install) >&2

# Return the absolute path on stdout
echo "$WORKTREE_DIR"
