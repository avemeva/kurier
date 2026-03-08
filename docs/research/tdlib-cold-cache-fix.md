# TDLib Cold Cache Fix

## Goal

The CLI's `msg list` returns only 1 message when fetching history from a chat not recently accessed ("cold cache"). TDLib returns locally cached messages first, and the CLI's pagination loop exits early when `batch.length < BATCH`. The fix makes every `getChatHistory` caller return the requested number of messages regardless of cache state. E2E tests run against a cold TDLib database (no `db.sqlite`) to catch this class of bug by default.

Success criteria:
```
# Cold-cache e2e test passes
bun test apps/cli/tests/e2e/cli.e2e.test.ts --test-name-pattern "cold-cache"
# exits 0

# All existing e2e tests pass under cold-cache daemon
bun run test:e2e
# exits 0
```

## Architecture

```
E2E test run
│
├── beforeAll:
│   ├── Create /tmp/kurier-e2e-XXXX/
│   │   └── tdlib_db/
│   │       └── td.binlog     ← copied from production (auth only, no db.sqlite)
│   ├── tg() helper configured with env:
│   │   ├── TG_APP_DIR=/tmp/kurier-e2e-XXXX
│   │   └── TG_DAEMON_PORT=7399
│   └── First tg() call auto-starts test daemon (cold TDLib, valid auth)
│
├── tests run against cold cache:
│   │
│   │  tg('msg', 'list', '<chat>', '--limit', '20')
│   │       │
│   │       ▼
│   │  CLI ──► test daemon (port 7399)
│   │              │
│   │              ▼
│   │         TDLib (no db.sqlite → cold cache)
│   │              │
│   │         getChatHistory(from_message_id=0, limit=50)
│   │              │
│   │         Returns 1 msg (locally known last_message)
│   │              │
│   │         [BUG: loop exits because 1 < 50]
│   │         [FIX: loop continues, next call fetches from server]
│   │
│   └── expect(data.length).toBeGreaterThan(1)
│
└── afterAll:
    ├── Stop test daemon
    └── Clean up /tmp/kurier-e2e-XXXX/
```

Constraints:
- `td.binlog` must come from the production dir — no way to create auth without interactive login
- PID/port/log files are derived from `APP_DIR` at module load time — `TG_APP_DIR` must be set before process starts
- `startProxy()` already accepts `databaseDirectory` — the `TG_APP_DIR` override cascades to it via `DB_DIR`
- CLI spawns daemon with `{ ...process.env }` — env vars propagate automatically
- Parallel test suites work: each gets unique `TG_APP_DIR` + `TG_DAEMON_PORT`, no shared state

## What's been done

- Reproduced the bug: `agent-telegram msg list 797545707 --limit 20` returns 1 message on first call, 20 on second
- Confirmed root cause in TDLib source (`MessagesManager.cpp:18890`): when `from_message_id=0` and `last_message_id` is known, TDLib skips server fetch
- Confirmed the pagination loop is the official TDLib solution (levlam's pseudocode in tdlib/td#168)
- Confirmed app code (`apps/app/src/mainview/lib/telegram.ts:153-183`) already handles this correctly — loops until empty batch, no `batch.length < BATCH` early exit
- Confirmed `db.sqlite` deletion while keeping `td.binlog` is safe and blessed by TDLib maintainer (tdlib/td#2893)

## TODO

### Step 1: `TG_APP_DIR` env var override

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 1.1 | `getAppDir()` in `paths.ts` returns `process.env.TG_APP_DIR` when set | `grep TG_APP_DIR packages/protocol/src/paths.ts` shows the check | TODO |
| 1.2 | Daemon uses overridden paths | `TG_APP_DIR=/tmp/test-td TG_DAEMON_PORT=7399 bun run apps/daemon/src/index.ts` writes PID to `/tmp/test-td/tg_daemon.pid` | TODO |

### Step 2: Fix `getChatHistory` pagination loop

Remove `batch.length < BATCH → exhausted` early exit at 3 locations. The loop already terminates correctly via empty batch (`batch.length === 0`), limit reached (`flatCount >= limit`), or safety cap (`scanned >= MAX_SCAN`).

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 2.1 | Remove early exit in plain history mode (`getChatHistory`, ~line 260) | `grep -c "batch.length < BATCH" apps/cli/src/commands/msg.ts` returns `0` | TODO |
| 2.2 | Remove early exit in `searchChatMessages` filter mode (~line 213) | Same grep | TODO |
| 2.3 | Remove early exit in `searchChatMessages` query mode (~line 121) | Same grep | TODO |
| 2.4 | App code unchanged (already correct) | `git diff apps/app/` shows no changes | TODO |

### Step 3: E2E test infrastructure — cold-cache daemon

Depends on: Step 1

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 3.1 | `beforeAll` creates temp dir, copies only `td.binlog` from production DB dir | Temp dir exists with only `td.binlog` inside `tdlib_db/` | TODO |
| 3.2 | `tg()` helper passes `TG_APP_DIR` + `TG_DAEMON_PORT` in env to all CLI calls | All CLI calls route to test daemon, not production | TODO |
| 3.3 | First `tg()` call auto-starts test daemon (via CLI's `ensureDaemon()`) | `tg('me')` succeeds in `beforeAll` | TODO |
| 3.4 | `afterAll` stops test daemon via `tg('daemon', 'stop')`, removes temp dir | `/tmp/kurier-e2e-*` doesn't exist after test run | TODO |
| 3.5 | Production DB untouched | `ls ~/Library/Application\ Support/dev.telegramai.app/tdlib_db/db.sqlite` exists after run | TODO |

### Step 4: Cold-cache regression test

Depends on: Steps 2, 3

| # | What | How to verify | Status |
|---|------|---------------|--------|
| 4.1 | Test fetches `msg list <chat> --limit 20` on cold cache, asserts `data.length > 1` | `bun test apps/cli/tests/e2e/cli.e2e.test.ts --test-name-pattern "cold-cache"` passes | TODO |
| 4.2 | All existing e2e tests pass under cold-cache daemon | `bun run test:e2e` exits 0 | TODO |

## Context for future agents

### Instructions for agents
- Do not ask questions — figure it out yourself
- Do not stop until all TODOs are done
- Run `bun run lint:fix && bun run lint` after code changes
- Run `bun run typecheck` after code changes
- Output COMPLETE when ALL steps are finished
- Use `trash` instead of `rm` for file deletion

### Key files

| File | Why |
|------|-----|
| `packages/protocol/src/paths.ts` | `getAppDir()` and all derived path constants (`DB_DIR`, `PID_FILE`, etc.) — add `TG_APP_DIR` override here |
| `packages/protocol/src/proxy/index.ts` | `startProxy()` with `ProxyOptions.databaseDirectory` — already wired, uses `DB_DIR` default |
| `apps/cli/src/commands/msg.ts` | 3x `batch.length < BATCH` early exits to remove (lines ~121, ~213, ~260) |
| `apps/cli/src/daemon.ts` | `spawnDaemon()` passes `{ ...process.env }` — env vars propagate to daemon child |
| `apps/cli/tests/e2e/cli.e2e.test.ts` | E2E tests — `tg()` helper, `beforeAll`/`afterAll`, all test cases |
| `apps/app/src/mainview/lib/telegram.ts:153-183` | App's `getMessages()` — reference implementation, already handles cold cache correctly |
| `~/Library/Application Support/dev.telegramai.app/tdlib_db/td.binlog` | Auth keys — copy to temp dir for test isolation |

### Reference implementations

| Source | What to take |
|--------|-------------|
| `apps/app/src/mainview/lib/telegram.ts:153-183` | Correct pagination loop: loop until empty batch, no `batch.length < BATCH` check |
| [tdlib/td#168](https://github.com/tdlib/td/issues/168) | levlam's canonical pseudocode for getChatHistory pagination |
| [tdlib/td#2893](https://github.com/tdlib/td/issues/2893) | Confirmation that deleting `db.sqlite` while keeping `td.binlog` is safe |

### Lessons learned

1. TDLib's `getChatHistory` with `from_message_id=0` skips server fetch when `last_message_id` is already known (from chat list updates). This is why cold chats return only 1 message — TDLib considers the local data sufficient.
2. The pagination loop (advance cursor, keep calling until empty batch) is the **only** solution. `openChat`, `loadChats`, `getChat` do NOT warm the message cache.
3. `td.binlog` = auth. `db.sqlite` = message cache. Deleting sqlite while keeping binlog preserves auth with cold cache — standard TDLib practice.
4. `batch.length < BATCH` is NOT a reliable signal that history is exhausted. Only `batch.length === 0` is reliable.
5. Env vars passed to `Bun.spawn()` are per-process — parallel test suites with different `TG_APP_DIR` + `TG_DAEMON_PORT` don't conflict.
