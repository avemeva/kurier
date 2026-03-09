#!/bin/bash
# Fast-forward main to the current worktree branch (rebase first if needed)
set -e

if [ ! -f .git ]; then
  echo "Error: must run from a git worktree (.git file not found). Run from a worktree directory, not the main repo."
  exit 1
fi

main_repo="$(git worktree list --porcelain | sed -n 's/^worktree //p' | head -1)"
branch="$(git branch --show-current)"

git -C "$main_repo" merge --ff-only "$branch"
