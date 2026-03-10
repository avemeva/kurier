#!/bin/bash
# Remove a worktree created by create-worktree.sh
# Called by Claude Code via WorktreeRemove hook.
# Receives JSON on stdin with a "worktree_path" field.
set -e

WORKTREE_PATH=$(cat | jq -r '.worktree_path')
if [ -z "$WORKTREE_PATH" ] || [ "$WORKTREE_PATH" = "null" ]; then
  echo "Error: no worktree_path provided" >&2
  exit 1
fi

git worktree remove "$WORKTREE_PATH" --force >&2
echo "Removed worktree: $WORKTREE_PATH" >&2
