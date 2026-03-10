#!/bin/bash
# Create a worktree outside the repo, install deps, and copy .env
# Called by Claude Code via WorktreeCreate hook.
# Receives JSON on stdin with a "name" field.
# Must print the absolute worktree path to stdout.
set -e

NAME=$(cat | jq -r '.name')
if [ -z "$NAME" ] || [ "$NAME" = "null" ]; then
  echo "Error: no worktree name provided" >&2
  exit 1
fi

MAIN=$(git worktree list --porcelain | head -1 | sed 's/worktree //')
REPO_NAME=$(basename "$MAIN")
DIR="$(dirname "$MAIN")/${REPO_NAME}-worktrees/$NAME"

# Create worktree branching from main
mkdir -p "$(dirname "$DIR")"
git worktree add "$DIR" -b "claude/$NAME" main >&2

# Install dependencies
(cd "$DIR" && bun install) >&2

# Copy .env from main repo
if [ -f "$MAIN/.env" ]; then
  cp "$MAIN/.env" "$DIR/.env"
  echo "Copied .env" >&2
fi

# Print the absolute path for Claude Code
echo "$DIR"
