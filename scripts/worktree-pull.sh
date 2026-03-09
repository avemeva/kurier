#!/bin/bash
# Rebase current worktree branch onto main
set -e

if [ ! -f .git ]; then
  echo "Error: must run from a git worktree (.git file not found). Run from a worktree directory, not the main repo."
  exit 1
fi

git rebase main
