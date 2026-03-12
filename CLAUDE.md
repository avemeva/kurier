# Kurier

## Product

Open-source Telegram desktop client with native AI integration. Built for productivity-focused power users.

## Git Commits

Use conventional prefixes in commit messages: `[fix]`, `[bug]`, `[feat]`, `[doc]`.

## Worktree Vocabulary

When user says "pull" or "push" in a worktree, they mean these scripts — not `git push`/`git pull`:
- **"pull"** — `bun run worktree:pull` (rebase branch onto main)
- **"push"** — `bun run worktree:push` (fast-forward main to branch)

## Worktree Rules

- You are likely in a worktree. Check with `[ -f .git ]` before proceeding.
- Never edit files in the main repo from a worktree.

## Worktree Setup

When working in a worktree, run before anything else:

```sh
bun install
MAIN=$(git worktree list --porcelain | head -1 | sed 's/worktree //')
cp "$MAIN/.env" .env
```

## Quality Checks

**Use `bun run`, not bare `bun test`** — bare `bun test` uses Bun's runner, but app tests use vitest.

```sh
bun run typecheck          # All packages
bun run test               # All packages (vitest for app, bun:test for cli)
bun run lint               # Biome
```

## Dev Server (Worktree)

```sh
bun run dev:hmr
```

Long-running process — run with `run_in_background`, **never pipe through `head`/`tail`** (blocks until pipe closes, hangs forever).

Auto-detects worktree name for portless URL:
- Main repo: `tg.localhost:1355`
- Worktree: `<worktree-name>.localhost:1355`

## Output

Always output clickable links: `http://`, `https://`, file paths as absolute paths.

## Certainty Labels

ALWAYS label statements with certainty level when explaining, reporting findings, diagnosing issues, or making architectural assessments:
- `[fact]` — verified from code, docs, or output
- `[assumption]` — educated guess, not yet verified
- `[inference]` — logical conclusion derived from facts

No exceptions. Every claim gets a label.

## Codebase Symbols

Before any coding task (implementing, refactoring, debugging, reviewing), run the symbol map first:

```sh
bun run scripts/symbols.ts .
```

This outputs every exported type, interface, class, function, and const per file (~1s). Use it to orient before touching code.

## Local CLAUDE.md

Before editing files in a directory, check for a `CLAUDE.md` in that directory and read it first.
