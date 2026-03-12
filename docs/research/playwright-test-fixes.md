# Fix Playwright Tests

## Goal

Make the Playwright test suite structurally sound: tests run in isolation (any test can run solo), use Playwright's fixture system instead of manual browser management, replace hardcoded waits with condition-based waits, and catch errors across the full session. The dev-page project should use `detectBaseURL()` like the other projects.

Success criteria:
```
cd apps/app && bunx playwright test --project app    # all pass, any single test can run with --grep
cd apps/app && bunx playwright test --project dev     # passes against portless URL, not hardcoded :5173
cd apps/app && bunx playwright test --project perf    # passes unchanged behavior
grep -c 'waitForTimeout' apps/app/tests/**/*.ts       # returns 0
grep -c 'chromium.launch' apps/app/tests/**/*.ts      # returns 0
```

## Architecture

```
playwright.config.ts
  ├── project: app   → e2e/app.test.ts      (needs daemon + auth)
  ├── project: dev   → e2e/dev-page.test.ts  (needs Vite only, mock data)
  └── project: perf  → perf/load.test.ts     (needs daemon + auth)

Browser lifecycle today:
  each test file → chromium.launch() in beforeAll → shared page → all tests mutate it

Browser lifecycle after:
  playwright.config.ts → use: { browserName, headless, baseURL }
  tests/fixtures.ts    → custom fixture: authed page (shared context, fresh page per test)
  each test file       → uses fixtures, no manual browser management
```

Constraints:
- `app` and `perf` tests require a running daemon (port 7312) with an authenticated TDLib session
- Auth state is in the daemon, not browser cookies/storage — so browser context sharing for auth isn't needed
- The `/dev` route is self-contained (mock data in `dev-data.ts`), no daemon needed
- No CI runs these tests — they're local-only. Don't try to add CI support.
- `data-testid` only for selectors (per `tests/CLAUDE.md`)

## What's been done

Nothing yet. Current state is the baseline described in the analysis above.

## Acceptance criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| A1 | Any individual app test runs solo | `cd apps/app && bunx playwright test --project app --grep "chat layout"` exits 0 |
| A2 | No manual browser launch in test files | `grep -c 'chromium.launch' apps/app/tests/e2e/*.ts apps/app/tests/perf/*.ts` returns 0 for all files |
| A3 | No `waitForTimeout` calls | `grep -rc 'waitForTimeout' apps/app/tests/` returns 0 |
| A4 | Console/exception listeners cover full session | `grep -n 'page.on.*console' apps/app/tests/e2e/app.test.ts` shows the listener is in the fixture or beforeAll, not inside a test |
| A5 | Dev project uses detectBaseURL | `grep 'localhost:5173' apps/app/playwright.config.ts` returns empty |
| A6 | All tests still pass | `cd apps/app && bunx playwright test` exits 0 |
| A7 | Perf tests still print readable reports | `cd apps/app && bunx playwright test --project perf` output contains "Time to first dialog" and "FCP" |

## TODO

### Step 1: Create shared fixtures file

Create `apps/app/tests/fixtures.ts` that provides two custom fixtures:

**`appPage` fixture** (for `app` project):
- Uses Playwright's built-in browser (from config `use:` block)
- Creates a **shared** browser context per worker (auth state is in daemon, so context sharing is just for speed)
- Creates a **fresh page** per test
- Navigates to baseURL
- Waits for app ready state (`dialog-item` or `input[type="tel"]`) with 20s timeout
- Registers `console` error listener and `pageerror` listener on page creation, stores in arrays accessible to tests
- Skips test if stuck on auth screen

**`devPage` fixture** (for `dev` project):
- Fresh page per test
- Navigates to `{baseURL}/dev`
- Waits for `[data-testid="dev-ui-primitives"]` with 15s timeout
- Registers console/pageerror listeners

**`perfPage` fixture** (for `perf` project):
- Fresh page per test
- Does NOT navigate (perf tests control their own navigation for timing)
- Provides `waitForApp()` helper as part of fixture

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 1.1 | Create `tests/fixtures.ts` with `appPage`, `devPage`, `perfPage` fixtures | File exists, `import { test } from '../fixtures'` compiles | TODO |
| 1.2 | Fixtures use Playwright's built-in browser, not manual `chromium.launch()` | `grep 'chromium.launch' apps/app/tests/fixtures.ts` returns empty | TODO |
| 1.3 | Console/pageerror listeners registered in fixture | `grep -A2 'page.on' apps/app/tests/fixtures.ts` shows both listeners | TODO |

### Step 2: Refactor `app.test.ts` to use fixtures

Replace the manual `beforeAll`/`afterAll` browser management with the `appPage` fixture. Each test gets its own page but shares a browser context.

Key changes:
- Remove `beforeAll`/`afterAll` blocks, `browser`/`context`/`page` variables
- Import `test` from `../fixtures` instead of `@playwright/test`
- Each test receives `{ page, errors, exceptions }` from fixture
- Tests that need a chat open should click a dialog themselves (no relying on prior test state)
- Group related tests that MUST share state into `test.describe.serial` blocks with explicit ordering

**Replace all `waitForTimeout` calls:**

| Location | Current | Replacement |
|----------|---------|-------------|
| Line 141 `waitForTimeout(500)` after click | Wait for `message-input` visibility | `await textarea.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})` |
| Line 171,175 `waitForTimeout(500)` after dialog click | Wait for chat-title to change | `await page.waitForFunction(...)` or `expect(title).not.toHaveText(firstTitle)` |
| Line 199 `waitForTimeout(200)` after fill | Remove — `fill` already waits for actionability |
| Line 249 `waitForTimeout(500)` after click | Wait for `message-panel` visibility | Already does this on next line, remove the timeout |
| Line 313 `waitForTimeout(1500)` idle check | Use `page.waitForTimeout` → `page.waitForFunction` that checks count stability over 1s |
| Line 326 `waitForTimeout(300)` | Remove — wheel events are synchronous |
| Line 329 `waitForTimeout(3000)` after scroll | `page.waitForFunction` polling message count > initialCount with 5s timeout |
| Line 371 `waitForTimeout(500)` in voice loop | Wait for `[data-testid="voice-message"]` or `[data-testid="message-bubble"]` |
| Line 419 `waitForTimeout(1000)` in error check | Remove — errors already collected by fixture listener across full session |

**Move error check tests:**
- "no console errors" and "no uncaught exceptions" tests should read from the fixture-provided `errors`/`exceptions` arrays, which collect across the full session (like `dev-page.test.ts` already does correctly)

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 2.1 | Remove manual browser lifecycle from `app.test.ts` | `grep 'chromium.launch\|browser.close\|browser.newContext' apps/app/tests/e2e/app.test.ts` returns empty | TODO |
| 2.2 | All tests use fixture-provided page | `grep 'async.*{.*page' apps/app/tests/e2e/app.test.ts` shows destructured page arg | TODO |
| 2.3 | Zero `waitForTimeout` calls | `grep -c 'waitForTimeout' apps/app/tests/e2e/app.test.ts` returns 0 | TODO |
| 2.4 | Error listeners cover full session | Console listener is in fixture, not in test body | TODO |
| 2.5 | Tests pass | `cd apps/app && bunx playwright test --project app` exits 0 | TODO |
| 2.6 | Any single test runs in isolation | `cd apps/app && bunx playwright test --project app --grep "sidebar shows"` exits 0 | TODO |

### Step 3: Refactor `dev-page.test.ts` to use fixtures

Simpler refactor — this file already handles error collection correctly. Just switch to fixture.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 3.1 | Remove manual browser lifecycle | `grep 'chromium.launch' apps/app/tests/e2e/dev-page.test.ts` returns empty | TODO |
| 3.2 | Use `devPage` fixture | Import from `../fixtures` | TODO |
| 3.3 | Tests pass | `cd apps/app && bunx playwright test --project dev` exits 0 | TODO |

### Step 4: Refactor `load.test.ts` to use fixtures

The perf file needs special handling — tests control their own navigation for timing measurement. The fixture should provide a page without navigating.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 4.1 | Remove manual browser lifecycle | `grep 'chromium.launch' apps/app/tests/perf/load.test.ts` returns empty | TODO |
| 4.2 | Move `waitForApp` and `extractWebVitals` helpers to fixture or shared utils | Helpers importable, not duplicated | TODO |
| 4.3 | Tests pass with same output | `cd apps/app && bunx playwright test --project perf` output contains timing reports | TODO |

### Step 5: Fix `dev` project baseURL in config

Change the `dev` project from hardcoded `localhost:5173` to use `detectBaseURL()` with `/dev` appended in the test.

The dev page is served by the same Vite dev server as the main app — just a different route (`/dev`). So the same `detectBaseURL()` works. The test already navigates to `${url}/dev`.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 5.1 | `dev` project uses `detectBaseURL()` | `grep 'localhost:5173' apps/app/playwright.config.ts` returns empty | TODO |
| 5.2 | Dev tests still pass | `cd apps/app && bunx playwright test --project dev` exits 0 | TODO |

### Step 6: Add `test:e2e` script to app package.json

Currently `apps/app/package.json` has no `test:e2e` script, so the root `bun run test:e2e` skips the app.

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 6.1 | Add `"test:e2e": "bunx playwright test --project app"` to `apps/app/package.json` | `cd apps/app && bun run test:e2e` runs Playwright tests | TODO |
| 6.2 | Root `bun run test:e2e` includes app | Output contains app test results | TODO |

## Context for future agents

### Instructions for agents
- Do not ask questions — figure it out yourself. If you need user input or manual tasks, use chrome extension MCP tools or agent-browser.
- Do not stop until all TODOs are done.
- Output COMPLETE when ALL steps are finished.
- Use `data-testid` attributes only for element selection — never CSS class selectors, tag names, or DOM structure.
- Run `bun run scripts/symbols.ts .` before coding to orient.
- Before editing files in a directory, check for a `CLAUDE.md` in that directory.
- The dev server must be running for tests to pass. Start it with `bun run dev:hmr` (run in background).
- The daemon must be running on port 7312 for `app` and `perf` tests. If it's not, those tests will skip — that's fine, verify they skip gracefully.
- Playwright version is 1.58.2. Check API compatibility.

### Key files

| File | Why |
|------|-----|
| `apps/app/playwright.config.ts` | Config with 3 projects and `detectBaseURL()` |
| `apps/app/tests/e2e/app.test.ts` | Main e2e tests (434 lines, ~25 tests) — biggest refactor target |
| `apps/app/tests/e2e/dev-page.test.ts` | Dev page tests (233 lines) — simpler, already handles errors correctly |
| `apps/app/tests/perf/load.test.ts` | Perf tests (209 lines) — needs fixture but keeps own navigation |
| `apps/app/tests/CLAUDE.md` | Test convention: `data-testid` only |
| `apps/app/package.json` | Missing `test:e2e` script |
| `apps/app/vite.config.ts` | Proxy config for daemon on port 7312 |

### Reference implementations

| Source | What to take |
|--------|-------------|
| Playwright docs on fixtures | https://playwright.dev/docs/test-fixtures — extend `test` with custom fixtures |
| `dev-page.test.ts` error handling | Lines 6-7, 15-18 — correct pattern for session-wide error collection |
| `load.test.ts` `waitForApp()` | Lines 11-22 — reusable helper for app ready state detection |

### Lessons learned

1. Auth lives in the daemon (TDLib on port 7312), not in browser state. Sharing browser context doesn't help with auth — it only saves browser startup time.
2. `detectBaseURL()` reads `~/.portless/routes.json` to bypass the portless proxy and connect directly to Vite's port. The dev page uses the same Vite server, just a different route.
3. The `Browser` type from `@playwright/test` can be imported directly — no need for the `ReturnType<typeof chromium.launch> extends Promise<infer T> ? T : never` gymnastics.
4. Some tests legitimately need sequential execution (e.g., "scroll down then check count increased"). Group these in `test.describe.serial` — don't try to make every test fully independent if it means duplicating expensive setup. The goal is: each `describe` block can run independently, not necessarily each atomic test.
5. The voice message test searches up to 10 chats — this is inherently slow. Consider checking the dev page for voice message rendering instead, and keeping the live-data test as a separate slower suite.
