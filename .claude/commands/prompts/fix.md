Fix all tests, lints, type errors, and other issues in the codebase.

## Rules

- **Don't be lazy.** Research the root problem. Understand it. Don't hotfix.
- Read the failing code, trace the logic, understand *why* it fails before changing anything.
- Never suppress errors — no `// @ts-ignore`, no `any` casts, no disabling lint rules, no skipping tests.
- If a test fails, understand what it's testing and why the assertion doesn't hold. Fix the source, not the test (unless the test itself is wrong).
- If a type error occurs, understand the type mismatch. Fix the types or the code to be correct, not to be silent.
- If a lint error occurs, understand what the rule protects against. Fix the code to satisfy the rule's intent.

## Process

1. Run the relevant checks (`bun run check`, `bun run test`, or specific workspace commands) to see all current failures.
2. Group related failures — often multiple errors share a single root cause.
3. For each root cause: read the code, understand the problem, fix it properly.
4. Re-run checks to confirm the fix and that no new issues were introduced.
5. Repeat until clean.
