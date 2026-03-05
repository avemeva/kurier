Create a commit for the current changes.

## Rules

- When lint/type/test errors block a commit: understand the root cause, fix it properly.
- No `// @ts-ignore`, no `any` casts, no disabling lint rules, no skipping tests to unblock a commit.
- Run `bun run lint` and `bun run typecheck` before committing. Fix issues first.
- Write a concise commit message that focuses on the "why" not the "what".
- If the "why" behind the changes isn't obvious, ask the user before writing the commit message.
