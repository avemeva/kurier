#!/usr/bin/env bash
set -euo pipefail

# Read worktree path from stdin (JSON: {"worktree_path": "..."})
WORKTREE_PATH=$(jq -r .worktree_path)

# Remove the worktree (all git output to stderr)
git worktree remove "$WORKTREE_PATH" --force >&2

# Clean up empty parent dirs (project dir, claude-worktree dir)
rmdir "$(dirname "$WORKTREE_PATH")" 2>/dev/null || true
rmdir "$(dirname "$(dirname "$WORKTREE_PATH")")" 2>/dev/null || true
